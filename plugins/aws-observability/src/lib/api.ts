// The only AWS access: STS, and read calls on CloudWatch Logs (FilterLogEvents), CloudWatch
// (GetMetricData, DescribeAlarms), Lambda (GetFunctionConfiguration), and SQS (GetQueueUrl,
// GetQueueAttributes). FilterLogEvents is billed like any API request, not per gigabyte scanned as
// Logs Insights is; GetMetricData is billed per metric requested.
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { GetFunctionConfigurationCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { clientDefaults, type Identity, verifyWithSts } from "@claude-code-aws/aws-client";

import { DEADLINE_MS } from "./bounds.js";

export interface FunctionConfig {
  name: string;
  runtime: string | null;
  timeoutSeconds: number | null;
  memoryMb: number | null;
  tracing: string | null;
  lastModified: string | null;
  deadLetterTarget: string | null;
}

export interface LogEvent {
  at: number;
  stream: string;
  message: string;
}

export interface MetricSpec {
  id: string;
  namespace: string;
  metric: string;
  stat: string;
  dimensions: Record<string, string>;
}

export interface MetricSeries {
  id: string;
  points: Array<{ t: string; v: number }>;
}

export interface AlarmInfo {
  name: string;
  state: string;
  reason: string | null;
  metric: string | null;
  updatedAt: string | null;
}

export interface QueueInfo {
  name: string;
  visible: number | null;
  inFlight: number | null;
  delayed: number | null;
  deadLetterTarget: string | null;
  maxReceiveCount: number | null;
  visibilityTimeoutSeconds: number | null;
}

export interface ObsApi {
  identity(): Promise<Identity>;
  getFunction(name: string): Promise<FunctionConfig>;
  filterLogs(
    group: string,
    startMs: number,
    endMs: number,
    pattern: string | undefined,
    limit: number,
    maxPages: number,
  ): Promise<{ events: LogEvent[]; truncated: boolean; missingGroup: boolean }>;
  metrics(
    specs: readonly MetricSpec[],
    startMs: number,
    endMs: number,
    periodSeconds: number,
  ): Promise<MetricSeries[]>;
  alarms(
    prefix: string | undefined,
    state: string | undefined,
    limit: number,
  ): Promise<AlarmInfo[]>;
  queue(name: string): Promise<QueueInfo>;
  close(): void;
}

const number = (value: string | undefined): number | null =>
  value === undefined || value === "" ? null : Number(value);

export function createObsApi(region: string, deadlineMs = DEADLINE_MS): ObsApi {
  const defaults = clientDefaults(region);
  const logs = new CloudWatchLogsClient(defaults);
  const watch = new CloudWatchClient(defaults);
  const lambda = new LambdaClient(defaults);
  const sqs = new SQSClient(defaults);
  const options = { abortSignal: AbortSignal.timeout(deadlineMs) };
  return {
    identity: () => verifyWithSts({ region, timeoutMs: deadlineMs }),

    async getFunction(name) {
      const config = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: name }),
        options,
      );
      return {
        name: config.FunctionName ?? name,
        runtime: config.Runtime ?? null,
        timeoutSeconds: config.Timeout ?? null,
        memoryMb: config.MemorySize ?? null,
        tracing: config.TracingConfig?.Mode ?? null,
        lastModified: config.LastModified ?? null,
        deadLetterTarget: config.DeadLetterConfig?.TargetArn ?? null,
      };
    },

    async filterLogs(group, startMs, endMs, pattern, limit, maxPages) {
      const events: LogEvent[] = [];
      let token: string | undefined;
      let pages = 0;
      try {
        do {
          const response = await logs.send(
            new FilterLogEventsCommand({
              logGroupName: group,
              startTime: startMs,
              endTime: endMs,
              ...(pattern === undefined ? {} : { filterPattern: pattern }),
              limit: Math.min(limit - events.length, 10_000),
              nextToken: token,
            }),
            options,
          );
          pages += 1;
          for (const event of response.events ?? [])
            events.push({
              at: event.timestamp ?? 0,
              stream: event.logStreamName ?? "",
              message: event.message ?? "",
            });
          token = response.nextToken;
        } while (token !== undefined && events.length < limit && pages < maxPages);
      } catch (error) {
        if ((error as { name?: string }).name === "ResourceNotFoundException")
          return { events: [], truncated: false, missingGroup: true };
        throw error;
      }
      return {
        events: events.slice(0, limit),
        truncated: token !== undefined || events.length > limit,
        missingGroup: false,
      };
    },

    async metrics(specs, startMs, endMs, periodSeconds) {
      const queries: MetricDataQuery[] = specs.map((spec) => ({
        Id: spec.id,
        MetricStat: {
          Metric: {
            Namespace: spec.namespace,
            MetricName: spec.metric,
            Dimensions: Object.entries(spec.dimensions).map(([Name, Value]) => ({ Name, Value })),
          },
          Period: periodSeconds,
          Stat: spec.stat,
        },
        ReturnData: true,
      }));
      const response = await watch.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: new Date(startMs),
          EndTime: new Date(endMs),
          ScanBy: "TimestampAscending",
          MaxDatapoints: 2000,
        }),
        options,
      );
      return (response.MetricDataResults ?? []).map((result) => ({
        id: result.Id ?? "",
        points: (result.Timestamps ?? []).map((t, index) => ({
          t: t.toISOString(),
          v: result.Values?.[index] ?? 0,
        })),
      }));
    },

    async alarms(prefix, state, limit) {
      const response = await watch.send(
        new DescribeAlarmsCommand({
          MaxRecords: limit,
          ...(prefix === undefined ? {} : { AlarmNamePrefix: prefix }),
          ...(state === undefined
            ? {}
            : { StateValue: state as "OK" | "ALARM" | "INSUFFICIENT_DATA" }),
        }),
        options,
      );
      return (response.MetricAlarms ?? []).map((alarm) => ({
        name: alarm.AlarmName ?? "",
        state: alarm.StateValue ?? "UNKNOWN",
        reason: alarm.StateReason ?? null,
        metric: alarm.MetricName ?? null,
        updatedAt: alarm.StateUpdatedTimestamp?.toISOString() ?? null,
      }));
    },

    async queue(name) {
      const url =
        (await sqs.send(new GetQueueUrlCommand({ QueueName: name }), options)).QueueUrl ?? "";
      const attrs =
        (
          await sqs.send(
            new GetQueueAttributesCommand({
              QueueUrl: url,
              AttributeNames: [
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
                "ApproximateNumberOfMessagesDelayed",
                "RedrivePolicy",
                "VisibilityTimeout",
              ],
            }),
            options,
          )
        ).Attributes ?? {};
      let redrive: { deadLetterTargetArn?: string; maxReceiveCount?: number } = {};
      try {
        redrive = JSON.parse(attrs["RedrivePolicy"] ?? "{}") as typeof redrive;
      } catch {
        redrive = {};
      }
      return {
        name,
        visible: number(attrs["ApproximateNumberOfMessages"]),
        inFlight: number(attrs["ApproximateNumberOfMessagesNotVisible"]),
        delayed: number(attrs["ApproximateNumberOfMessagesDelayed"]),
        deadLetterTarget: redrive.deadLetterTargetArn ?? null,
        maxReceiveCount: redrive.maxReceiveCount ?? null,
        visibilityTimeoutSeconds: number(attrs["VisibilityTimeout"]),
      };
    },

    close() {
      logs.destroy();
      watch.destroy();
      lambda.destroy();
      sqs.destroy();
    },
  };
}
