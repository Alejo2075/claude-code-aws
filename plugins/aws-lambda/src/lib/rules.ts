import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, runtimeStatus, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-lambda";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);
const str = (v: unknown, fallback = "?"): string => (typeof v === "string" ? v : fallback);
const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;

export interface Row {
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  return resourcesOfType(t, "AWS::Lambda::Function").map((f) => {
    const env =
      isRecord(f.properties["Environment"]) && isRecord(f.properties["Environment"]["Variables"])
        ? Object.keys(f.properties["Environment"]["Variables"])
        : [];
    const arch = Array.isArray(f.properties["Architectures"])
      ? str(f.properties["Architectures"][0])
      : "x86_64";
    return {
      id: `${stack}/${f.logicalId}`,
      detail: `${str(f.properties["Runtime"], "image/custom")}, ${arch}, ${num(f.properties["MemorySize"], 128)} MB, ${num(f.properties["Timeout"], 3)} s, env keys [${env.join(", ")}]`,
    };
  });
}

export function rules(stack: string, t: Template, now: Date): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  const invokeConfigs = resourcesOfType(t, "AWS::Lambda::EventInvokeConfig").map((c) =>
    JSON.stringify(c.properties["FunctionName"]),
  );
  for (const f of resourcesOfType(t, "AWS::Lambda::Function")) {
    const id = at(f.logicalId);
    const runtime = f.properties["Runtime"];
    if (typeof runtime === "string") {
      const s = runtimeStatus(runtime, now);
      if (s.state === "deprecated" || s.state === "approaching")
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "LMB-RUNTIME",
            severity: s.state === "deprecated" ? "high" : "medium",
            title: `Runtime ${runtime} is ${s.state === "deprecated" ? "deprecated" : "nearing deprecation"}${s.deprecationDate === null ? "" : ` (${s.deprecationDate})`}`,
            explanation:
              "A deprecated runtime stops receiving security patches and eventually cannot be updated.",
            subject: id,
            resources: [id],
            recommendation:
              "Move to a supported runtime. The table is a dated snapshot in template-analysis; confirm on the Lambda runtimes page.",
          }),
        );
    }
    const mem = num(f.properties["MemorySize"], 128);
    const timeout = num(f.properties["Timeout"], 3);
    if (mem < 128 || mem > 10240)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-MEMORY-RANGE",
          severity: "high",
          title: `Memory ${mem} MB is outside 128 to 10,240`,
          explanation: "Lambda accepts 128 to 10,240 MB.",
          subject: id,
          resources: [id],
        }),
      );
    if (timeout > 900 || timeout < 1)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-TIMEOUT-RANGE",
          severity: "high",
          title: `Timeout ${timeout} s is outside 1 to 900`,
          explanation: "A standard function can run for at most 900 seconds (15 minutes).",
          subject: id,
          resources: [id],
        }),
      );
    if (mem === 128 && timeout >= 30)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-SMALL-MEMORY-LONG-TIMEOUT",
          severity: "low",
          status: "hypothesis",
          title: "128 MB with a long timeout",
          explanation:
            "CPU scales with memory (about one vCPU at 1,769 MB), so a function with a long timeout and the smallest memory is often slow because it is CPU starved. Measure before changing: a larger size can be both faster and cheaper.",
          subject: id,
          resources: [id],
          recommendation: "Compare durations at several sizes (/aws-cost:compare lambda-memory).",
        }),
      );
    const env =
      isRecord(f.properties["Environment"]) && isRecord(f.properties["Environment"]["Variables"])
        ? f.properties["Environment"]["Variables"]
        : {};
    for (const [name, value] of Object.entries(env))
      if (
        SECRET_NAME.test(name) &&
        typeof value === "string" &&
        value !== "" &&
        !value.startsWith("arn:")
      )
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "LMB-SECRET-IN-ENV",
            severity: "high",
            title: `Environment variable ${name} looks like a secret with a literal value`,
            explanation:
              "Environment variables are visible to anyone who can read the function configuration and are stored in the template and its history.",
            subject: `${id}:${name}`,
            resources: [id],
            recommendation:
              "Store the secret in Secrets Manager or SSM SecureString and read it at run time (store only the name or ARN here).",
          }),
        );
    if (JSON.stringify(env).length > 3500)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-ENV-SIZE",
          severity: "medium",
          title: "Environment variables are close to the 4 KB limit",
          explanation: "All environment variables together may use at most 4 KB.",
          subject: id,
          resources: [id],
        }),
      );
    if (Array.isArray(f.properties["Layers"]) && f.properties["Layers"].length > 5)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-LAYERS",
          severity: "high",
          title: "More than five layers",
          explanation: "A function may use at most five layers.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      !isRecord(f.properties["TracingConfig"]) ||
      f.properties["TracingConfig"]["Mode"] !== "Active"
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-NO-TRACING",
          severity: "info",
          title: "Active tracing is off",
          explanation: "Without tracing, calls across services are harder to follow.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      !Array.isArray(f.properties["Architectures"]) ||
      !f.properties["Architectures"].includes("arm64")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-X86",
          severity: "info",
          title: "Runs on x86_64",
          explanation:
            "arm64 is often cheaper per unit of work and uses less energy; it needs dependencies built for arm64.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      !invokeConfigs.some((c) => c.includes(f.logicalId)) &&
      f.properties["DeadLetterConfig"] === undefined
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-ASYNC-NO-FAILURE-DEST",
          severity: "low",
          status: "hypothesis",
          title: "No failure destination or dead-letter queue for asynchronous invocations",
          explanation:
            "If the function is invoked asynchronously (S3, SNS, EventBridge), an event that fails every retry is dropped. Skip this if it is only invoked synchronously or by a queue.",
          subject: id,
          resources: [id],
          recommendation:
            "Add an EventInvokeConfig with an OnFailure destination, or a DeadLetterConfig.",
        }),
      );
  }
  for (const u of resourcesOfType(t, "AWS::Lambda::Url"))
    if (u.properties["AuthType"] === "NONE")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-URL-NO-AUTH",
          severity: "high",
          title: "Function URL has no authentication",
          explanation: "Anyone on the internet can invoke the function, and you pay for each call.",
          subject: at(u.logicalId),
          resources: [at(u.logicalId)],
          recommendation:
            "Use AuthType AWS_IAM, or put the function behind API Gateway with an authorizer.",
        }),
      );
  return out;
}
