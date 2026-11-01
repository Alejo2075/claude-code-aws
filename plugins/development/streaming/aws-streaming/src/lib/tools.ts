import { createHash } from "node:crypto";

export interface ShardInput {
  writeMbPerSec: number;
  recordsPerSec: number;
  readMbPerSec: number;
  consumers: number;
  enhancedFanOut: boolean;
}

/** Provisioned-mode shard estimate from the per-shard limits in the Kinesis quotas page. */
export function shardsNeeded(i: ShardInput): {
  shards: number;
  byWrite: number;
  byRecords: number;
  byRead: number;
  notes: string[];
} {
  const byWrite = Math.ceil(i.writeMbPerSec / 1);
  const byRecords = Math.ceil(i.recordsPerSec / 1000);
  // Shared-throughput consumers split 2 MB/s per shard; each enhanced fan-out consumer gets its own 2 MB/s.
  const totalRead = i.enhancedFanOut ? i.readMbPerSec : i.readMbPerSec * Math.max(1, i.consumers);
  const byRead = i.enhancedFanOut ? Math.ceil(i.readMbPerSec / 2) : Math.ceil(totalRead / 2);
  const shards = Math.max(1, byWrite, byRecords, byRead);
  const notes = [
    "Limits used: a shard accepts up to 1 MB/s or 1,000 records/s of writes and serves up to 2 MB/s of reads shared by consumers; enhanced fan-out gives each registered consumer 2 MB/s per shard.",
    "Add headroom: traffic is rarely perfectly even across partition keys, so the busiest shard reaches its limit before the average does.",
    "On-demand mode removes the shard planning; new on-demand streams start at 4 MB/s write and 8 MB/s read and scale with traffic.",
  ];
  if (i.consumers > 5 && !i.enhancedFanOut)
    notes.push(
      "With many shared-throughput consumers each one gets a small slice of the 2 MB/s; consider enhanced fan-out (limited to 20 registered consumers by default).",
    );
  return { shards, byWrite, byRecords, byRead, notes };
}

/** Which of N equal shard ranges each key's MD5 hash falls in (Kinesis maps the 128-bit MD5 of the key onto the shards' hash key ranges). */
export function shardOf(key: string, shards: number): number {
  const digest = createHash("md5").update(key, "utf8").digest("hex");
  const value = BigInt(`0x${digest}`);
  const space = 1n << 128n;
  return Number((value * BigInt(shards)) / space);
}

export interface Distribution {
  keys: number;
  distinct: number;
  perShard: number[];
  topKey: { key: string; share: number } | null;
  busiestShardShare: number;
  warnings: string[];
}

export function distribution(keys: readonly string[], shards: number): Distribution {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const perShard = new Array<number>(shards).fill(0);
  for (const [k, n] of counts)
    perShard[shardOf(k, shards)] = (perShard[shardOf(k, shards)] ?? 0) + n;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topKey = top === undefined ? null : { key: top[0], share: top[1] / keys.length };
  const busiest = keys.length === 0 ? 0 : Math.max(...perShard) / keys.length;
  const warnings: string[] = [];
  if (topKey !== null && topKey.share > 0.25 && shards > 1)
    warnings.push(
      `One key ("${topKey.key.slice(0, 40)}") carries ${(topKey.share * 100).toFixed(0)}% of the records, so one shard takes that load whatever the shard count.`,
    );
  if (counts.size < shards * 2)
    warnings.push(
      `Only ${counts.size} distinct key(s) for ${shards} shard(s): some shards will get no traffic.`,
    );
  if (busiest > 2 / shards && shards > 1)
    warnings.push(
      `The busiest shard gets ${(busiest * 100).toFixed(0)}% of the sample against an even ${(100 / shards).toFixed(0)}%.`,
    );
  return {
    keys: keys.length,
    distinct: counts.size,
    perShard,
    topKey,
    busiestShardShare: busiest,
    warnings,
  };
}

export function recordCheck(bytes: number, maxMiB: number): { ok: boolean; message: string } {
  const limit = maxMiB * 1024 * 1024;
  return bytes <= limit
    ? {
        ok: true,
        message: `${bytes} bytes fits the stream's ${maxMiB} MiB record limit (the default is 1 MiB; a stream can be configured up to 10 MiB, and large records use burst capacity).`,
      }
    : {
        ok: false,
        message: `${bytes} bytes is over the ${maxMiB} MiB record limit. Store the payload in S3 and send a pointer, or raise the stream's maximum record size (up to 10 MiB).`,
      };
}

export function lagHypotheses(i: {
  iteratorAgeMs: number;
  incomingMbPerSec: number;
  shards: number;
  throttledWrites: number;
  lambdaErrors: number;
}): string[] {
  const out: string[] = [];
  if (i.lambdaErrors > 0 && i.iteratorAgeMs > 60_000)
    out.push(
      "The consumer is failing on a batch and retrying it; the iterator age grows while a poison record blocks its shard. Check the consumer's retry, bisect, and on-failure settings.",
    );
  if (i.throttledWrites > 0)
    out.push(
      "Producers are throttled (WriteProvisionedThroughputExceeded): the stream is under-provisioned or one partition key is hot.",
    );
  if (i.incomingMbPerSec > i.shards * 0.8)
    out.push(
      `Ingest is ${i.incomingMbPerSec} MB/s on ${i.shards} shard(s), above 80% of the 1 MB/s per shard write limit.`,
    );
  if (i.iteratorAgeMs > 60_000 && out.length === 0)
    out.push(
      "The consumer is slower than the producers without errors: add consumer concurrency (parallelization factor) or shards, or reduce per-record work.",
    );
  if (out.length === 0) out.push("Nothing in these numbers points to a problem.");
  return out;
}
