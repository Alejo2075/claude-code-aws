const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const TiB = 1024 * GiB;

/** Limits from the S3 multipart upload limits page: 5 MiB to 5 GiB per part, 10,000 parts, 48.8 TiB per object. */
export const LIMITS = {
  minPart: 5 * MiB,
  maxPart: 5 * GiB,
  maxParts: 10_000,
  maxObject: Math.floor(48.8 * TiB),
};

export function parseSize(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kib|mib|gib|tib|kb|mb|gb|tb)?$/i.exec(text.trim());
  if (m === null) return null;
  const unit = (m[2] ?? "b").toLowerCase();
  const scale: Record<string, number> = {
    b: 1,
    kib: 1024,
    kb: 1024,
    mib: MiB,
    mb: MiB,
    gib: GiB,
    gb: GiB,
    tib: TiB,
    tb: TiB,
  };
  return Math.floor(Number(m[1]) * (scale[unit] ?? 1));
}

export interface UploadPlan {
  method: "single-put" | "multipart" | "too-large";
  partSizeMiB?: number;
  parts?: number;
  notes: string[];
}

export function planUpload(bytes: number, partMiB?: number): UploadPlan {
  const notes = [
    "Verify integrity with a checksum (ChecksumAlgorithm on the upload) and compare it after completion.",
    "Presigned URLs carry the signer's permissions until they expire: keep the expiry short and scope the key, the content type, and the size.",
  ];
  if (bytes > LIMITS.maxObject)
    return {
      method: "too-large",
      notes: [`The maximum object size is 48.8 TiB; ${bytes} bytes is larger.`],
    };
  if (bytes < 100 * MiB && partMiB === undefined)
    return {
      method: "single-put",
      notes: [
        "Under 100 MiB a single PUT is simple. S3 suggests considering multipart from about 100 MiB.",
        ...notes,
      ],
    };
  const floor = Math.max(LIMITS.minPart, Math.ceil(bytes / LIMITS.maxParts / MiB) * MiB);
  const chosen = partMiB === undefined ? Math.max(floor, 16 * MiB) : partMiB * MiB;
  if (chosen < floor)
    return {
      method: "multipart",
      notes: [
        `A part size of ${partMiB} MiB would need more than 10,000 parts for this object. The smallest allowed is ${floor / MiB} MiB.`,
      ],
    };
  if (chosen > LIMITS.maxPart)
    return { method: "multipart", notes: ["A part cannot exceed 5 GiB."] };
  return {
    method: "multipart",
    partSizeMiB: chosen / MiB,
    parts: Math.ceil(bytes / chosen),
    notes: [
      "Every part except the last must be at least 5 MiB. Parts can be uploaded in parallel and retried separately.",
      "Abort uploads that fail, and keep a lifecycle rule that aborts incomplete uploads, or the parts are billed.",
      ...notes,
    ],
  };
}

export interface KeyProblem {
  level: "error" | "warning";
  message: string;
}

/** Problems with an object key built from user input. S3 accepts almost anything, so most of these are about what your code and its consumers do with it. */
export function checkKey(key: string): KeyProblem[] {
  const out: KeyProblem[] = [];
  const bytes = Buffer.byteLength(key, "utf8");
  if (key === "") out.push({ level: "error", message: "The key is empty." });
  if (bytes > 1024)
    out.push({ level: "error", message: `The key is ${bytes} bytes; the limit is 1,024.` });
  if (key.split("/").some((s) => s === ".."))
    out.push({
      level: "error",
      message:
        'The key contains a ".." segment. S3 treats it as plain text, but any code or tool that maps keys to file paths can be tricked into leaving its directory.',
    });
  if (key.split("/").some((s) => s === "."))
    out.push({
      level: "warning",
      message:
        'The key contains a "." segment, which file-based tools treat as the current directory.',
    });
  if (key.startsWith("/"))
    out.push({
      level: "warning",
      message:
        "The key starts with a slash, which makes an empty first folder in consoles and sync tools.",
    });
  if (key.includes("//"))
    out.push({
      level: "warning",
      message: "The key contains an empty segment (//), which many tools collapse.",
    });
  if (key.includes("\\"))
    out.push({
      level: "error",
      message: "The key contains a backslash, which Windows tools treat as a path separator.",
    });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key))
    out.push({ level: "error", message: "The key contains control characters." });
  if (/[&$@=;:+ ,?{}^%`[\]"<>~#|]/.test(key))
    out.push({
      level: "warning",
      message:
        "The key contains characters that need URL-encoding or special handling in some clients (& $ @ = ; : + space , ? and others).",
    });
  if (out.length === 0)
    out.push({
      level: "warning",
      message:
        "No structural problem found. Even so, do not use a user's file name as the key: generate the key on the server (for example an id plus a folder per user) and keep the original name as metadata.",
    });
  return out;
}

export interface LifecycleRule {
  ID?: string;
  Status?: string;
  Filter?: unknown;
  Prefix?: string;
  Transitions?: Array<{ Days?: number; StorageClass?: string }>;
  Expiration?: { Days?: number };
  NoncurrentVersionExpiration?: { NoncurrentDays?: number };
  AbortIncompleteMultipartUpload?: { DaysAfterInitiation?: number };
}

/** Structural checks of a lifecycle configuration. Minimum storage durations and costs are in the S3 pricing and storage class pages; check them before choosing days. */
export function checkLifecycle(config: unknown): string[] {
  const rules = (config as { Rules?: unknown } | null)?.Rules;
  if (!Array.isArray(rules)) return ['The document must look like {"Rules": [...]}.'];
  const out: string[] = [];
  const ids = new Set<string>();
  (rules as LifecycleRule[]).forEach((r, i) => {
    const where = `Rule ${r.ID ?? i + 1}`;
    if (r.ID !== undefined) {
      if (ids.has(r.ID)) out.push(`${where}: the ID is used by another rule.`);
      ids.add(r.ID);
    }
    if (r.Status !== "Enabled" && r.Status !== "Disabled")
      out.push(`${where}: Status must be Enabled or Disabled.`);
    if (r.Filter === undefined && r.Prefix === undefined)
      out.push(
        `${where}: no Filter, so it applies to the whole bucket. Say so with an empty Filter if that is intended.`,
      );
    const days = (r.Transitions ?? []).map((t) => t.Days ?? Number.NaN);
    if (days.some((d) => !Number.isInteger(d) || d < 0))
      out.push(`${where}: every transition needs a whole number of Days.`);
    else if (days.some((d, j) => j > 0 && d <= (days[j - 1] ?? 0)))
      out.push(`${where}: transitions must be in increasing Days order.`);
    const last = days.length === 0 ? null : (days[days.length - 1] ?? null);
    if (r.Expiration?.Days !== undefined && last !== null && r.Expiration.Days <= last)
      out.push(
        `${where}: expiration (${r.Expiration.Days} days) comes at or before the last transition (${last} days).`,
      );
    if (
      r.Expiration === undefined &&
      r.NoncurrentVersionExpiration === undefined &&
      (r.Transitions ?? []).length === 0 &&
      r.AbortIncompleteMultipartUpload === undefined
    )
      out.push(`${where}: it does nothing (no transition, expiration, or abort action).`);
  });
  if (!(rules as LifecycleRule[]).some((r) => r.AbortIncompleteMultipartUpload !== undefined))
    out.push("No rule aborts incomplete multipart uploads; abandoned parts keep costing money.");
  return out;
}

export interface PolicyFinding {
  severity: "high" | "medium" | "low";
  message: string;
}

export function reviewBucketPolicy(policy: unknown): PolicyFinding[] {
  const statements = (policy as { Statement?: unknown } | null)?.Statement;
  const list = Array.isArray(statements)
    ? statements
    : statements === undefined
      ? []
      : [statements];
  const out: PolicyFinding[] = [];
  let tls = false;
  for (const s of list as Array<Record<string, unknown>>) {
    const text = JSON.stringify(s);
    if (s["Effect"] === "Deny" && text.includes("aws:SecureTransport")) tls = true;
    if (s["Effect"] !== "Allow") continue;
    const principal = s["Principal"];
    const open =
      principal === "*" ||
      (typeof principal === "object" &&
        principal !== null &&
        (principal as { AWS?: unknown }).AWS === "*");
    if (open && s["Condition"] === undefined)
      out.push({
        severity: "high",
        message: "Allows any principal with no condition: the actions are open to the internet.",
      });
    else if (open)
      out.push({
        severity: "medium",
        message:
          "Allows any principal but has a condition; confirm the condition really restricts who can call (for example aws:SourceArn or aws:PrincipalOrgID).",
      });
    const actions = JSON.stringify(s["Action"] ?? "");
    if (/"s3:\*"|^"\*"$/.test(actions))
      out.push({
        severity: "medium",
        message: "Grants every S3 action; list only the actions needed.",
      });
    if (s["Resource"] === "*")
      out.push({ severity: "low", message: 'Resource is "*"; name the bucket and prefix.' });
  }
  if (!tls)
    out.push({
      severity: "low",
      message: "No statement denies requests made without TLS (aws:SecureTransport = false).",
    });
  return out;
}
