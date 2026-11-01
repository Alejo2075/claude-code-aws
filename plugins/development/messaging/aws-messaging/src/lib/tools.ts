import { type Json } from "@claude-code-aws/content-filter";

const isObject = (v: unknown): v is { [k: string]: Json } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** SNS message attributes `{name: {Type, Value}}` as plain values the matcher can compare. */
export function attributesToValues(
  attributes: unknown,
): { ok: true; value: { [k: string]: Json } } | { ok: false; error: string } {
  if (!isObject(attributes)) return { ok: false, error: "message attributes must be an object" };
  const out: { [k: string]: Json } = {};
  for (const [name, raw] of Object.entries(attributes)) {
    if (!isObject(raw) || typeof raw["Type"] !== "string" || raw["Value"] === undefined)
      return { ok: false, error: `attribute ${name} needs Type and Value` };
    const type = raw["Type"];
    const value = raw["Value"];
    if (type === "Number") {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: `attribute ${name} is not a number` };
      out[name] = n;
    } else if (type === "String.Array") {
      try {
        const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) throw new Error("not a list");
        out[name] = parsed as Json[];
      } catch {
        return { ok: false, error: `attribute ${name} is not a JSON list` };
      }
    } else out[name] = value;
  }
  return { ok: true, value: out };
}

export interface FifoInput {
  groupId?: string;
  dedupId?: string;
  contentBased: boolean;
}

const ALLOWED = /^[A-Za-z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/;

/** What a send to a FIFO queue needs. The 128-character group id limit is from the SQS quotas. */
export function checkFifoSend(input: FifoInput): string[] {
  const problems: string[] = [];
  if (input.groupId === undefined || input.groupId === "")
    problems.push("MessageGroupId is required for every message sent to a FIFO queue.");
  else if (input.groupId.length > 128 || !ALLOWED.test(input.groupId))
    problems.push("MessageGroupId must be 1 to 128 characters: letters, digits, and punctuation.");
  if (!input.contentBased && (input.dedupId === undefined || input.dedupId === ""))
    problems.push("MessageDeduplicationId is required because content-based deduplication is off.");
  if (input.dedupId !== undefined && input.dedupId !== "" && !ALLOWED.test(input.dedupId))
    problems.push(
      "MessageDeduplicationId uses characters outside letters, digits, and punctuation.",
    );
  return problems;
}

export interface BacklogInput {
  visible: number;
  inFlight: number;
  oldestAgeSeconds: number;
  receiveRatePerSec: number;
  sendRatePerSec: number;
  visibilitySeconds: number;
  retentionSeconds: number;
  dlqDepth: number;
}

export interface Hypothesis {
  statement: string;
  basis: string;
  next: string;
}

/** Hypotheses from numbers the user supplies. They are not diagnoses: each names the check that would settle it. */
export function diagnoseBacklog(i: BacklogInput): Hypothesis[] {
  const out: Hypothesis[] = [];
  if (i.sendRatePerSec > i.receiveRatePerSec)
    out.push({
      statement: "Messages arrive faster than they are consumed, so the backlog grows.",
      basis: `send ${i.sendRatePerSec}/s > receive ${i.receiveRatePerSec}/s`,
      next: "Check consumer concurrency, batch size, and consumer errors; for Lambda check throttles and the event source mapping's maximum concurrency.",
    });
  if (i.inFlight > 0 && i.visible > 0 && i.receiveRatePerSec === 0)
    out.push({
      statement:
        "Consumers hold messages but finish none: they may be stuck or failing after receive.",
      basis: `${i.inFlight} in flight, nothing received per second`,
      next: "Look at consumer errors and timeouts; compare processing time with the visibility timeout.",
    });
  if (i.oldestAgeSeconds > i.retentionSeconds * 0.8)
    out.push({
      statement: "The oldest message is close to the retention limit and may expire unprocessed.",
      basis: `oldest ${i.oldestAgeSeconds}s of ${i.retentionSeconds}s retention`,
      next: "Raise retention temporarily and add consumer capacity, or move old messages to a dead-letter queue deliberately.",
    });
  if (i.oldestAgeSeconds > i.visibilitySeconds * 3 && i.dlqDepth === 0 && i.visible > 0)
    out.push({
      statement:
        "Old messages are being retried but never dead-lettered: a poison message may loop, or no redrive policy exists.",
      basis: `oldest ${i.oldestAgeSeconds}s, dead-letter depth 0`,
      next: "Check that a redrive policy exists and what maxReceiveCount is; read one message's receive count (that is a receive, so do it deliberately).",
    });
  if (i.dlqDepth > 0)
    out.push({
      statement: "Messages are failing permanently and landing in the dead-letter queue.",
      basis: `${i.dlqDepth} message(s) in the dead-letter queue`,
      next: "Sample a few dead-lettered messages with the owner's approval, find the shared cause, fix the consumer, then redrive in a controlled batch.",
    });
  if (out.length === 0)
    out.push({
      statement: "Nothing in these numbers points to a problem.",
      basis: "all checks passed",
      next: "A small backlog under steady load can be normal; compare with the usual baseline.",
    });
  return out;
}
