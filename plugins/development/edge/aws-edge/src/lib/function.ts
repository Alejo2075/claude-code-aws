// Lints the source of a CloudFront Function. The runtime has no dynamic code evaluation and restricts
// the network, file system, environment variables, and timers; functions cannot read the request
// body. Findings come from these documented restrictions plus a check for the handler.
export interface Issue {
  level: "error" | "warning";
  message: string;
  line: number;
}

const BANNED: Array<[RegExp, string]> = [
  [/\beval\s*\(/, "eval() is not available: the runtime does not allow dynamic code evaluation"],
  [
    /\bnew\s+Function\s*\(/,
    "new Function() is not available: the runtime does not allow dynamic code evaluation",
  ],
  [
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/,
    "network access is not available in CloudFront Functions",
  ],
  [
    /\bsetTimeout\s*\(|\bsetInterval\s*\(|\bsetImmediate\s*\(/,
    "timers are not available in CloudFront Functions",
  ],
  [
    /\bprocess\.env\b|\bprocess\.argv\b/,
    "environment variables are not available in CloudFront Functions",
  ],
  [
    /\brequire\s*\(\s*['"](fs|net|http|https|child_process|os|path)['"]\s*\)|\bfrom\s+['"](fs|net|http|https|child_process)['"]/,
    "file system and network modules are not available",
  ],
];

export function lintFunction(source: string): Issue[] {
  const issues: Issue[] = [];
  const lines = source.split("\n");
  if (source.length > 200_000)
    return [{ level: "error", message: "the source is too large to lint", line: 1 }];
  const body = lines.map((l) => l.replace(/\/\/.*$/, ""));
  lines.forEach((_l, i) => {
    const code = body[i] ?? "";
    for (const [re, message] of BANNED)
      if (re.test(code)) issues.push({ level: "error", message, line: i + 1 });
    if (/\b(event\.request|request)\.body\b/.test(code))
      issues.push({
        level: "error",
        message: "CloudFront Functions cannot access the request body",
        line: i + 1,
      });
  });
  const joined = body.join("\n");
  if (
    !/\bfunction\s+handler\s*\(|\bhandler\s*=\s*(async\s*)?\(?[^)]*\)?\s*=>|\bconst\s+handler\b/.test(
      joined,
    )
  )
    issues.push({
      level: "error",
      message:
        "no handler function: define `function handler(event)` that returns the request or a response",
      line: 1,
    });
  if (!/\breturn\b/.test(joined))
    issues.push({
      level: "error",
      message:
        "the function never returns: it must return the (modified) request or a response object",
      line: 1,
    });
  if (/\bconsole\.log\b/.test(joined))
    issues.push({
      level: "warning",
      message: "console.log output is truncated at 10 KB per invocation and function logs add cost",
      line: 1,
    });
  if (/\.headers\[['"][A-Z]/.test(joined))
    issues.push({
      level: "warning",
      message: "header names in the event are lowercase; an uppercase key will not match",
      line: 1,
    });
  return issues;
}

export interface CachePolicyIssue {
  severity: "high" | "medium" | "low" | "info";
  message: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reviews a cache policy (the CloudFormation CachePolicyConfig shape, or its API equivalent). */
export function reviewCachePolicy(doc: unknown): CachePolicyIssue[] {
  const raw = isObj(doc) && isObj(doc["CachePolicyConfig"]) ? doc["CachePolicyConfig"] : doc;
  if (!isObj(raw))
    return [
      { severity: "high", message: "the document must be a cache policy configuration object" },
    ];
  const out: CachePolicyIssue[] = [];
  const p = isObj(raw["ParametersInCacheKeyAndForwardedToOrigin"])
    ? raw["ParametersInCacheKeyAndForwardedToOrigin"]
    : {};
  const kind = (k: string, field: string): string => {
    const cfg = p[k];
    const v = isObj(cfg) ? cfg[field] : undefined;
    return typeof v === "string" ? v : "none";
  };
  if (kind("CookiesConfig", "CookieBehavior") === "all")
    out.push({
      severity: "medium",
      message:
        "All cookies are in the cache key: every distinct cookie value is a separate cache entry, so the hit ratio collapses. Include only the cookies the origin needs.",
    });
  if (kind("QueryStringsConfig", "QueryStringBehavior") === "all")
    out.push({
      severity: "low",
      message:
        "All query strings are in the cache key; unrelated parameters (tracking ids) split the cache. Allow-list the ones that change the response.",
    });
  const hc = isObj(p["HeadersConfig"]) ? p["HeadersConfig"] : {};
  const headers = (Array.isArray(hc["Headers"]) ? hc["Headers"] : [])
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.toLowerCase());
  if (headers.includes("authorization"))
    out.push({
      severity: "medium",
      message:
        "The Authorization header is in the cache key, so responses are cached per user token; make sure that is intended, or do not cache authenticated responses.",
    });
  if (headers.includes("host"))
    out.push({
      severity: "low",
      message: "The Host header is in the cache key; this splits the cache by hostname.",
    });
  const min = typeof raw["MinTTL"] === "number" ? raw["MinTTL"] : 0;
  const def = typeof raw["DefaultTTL"] === "number" ? raw["DefaultTTL"] : 86400;
  const max = typeof raw["MaxTTL"] === "number" ? raw["MaxTTL"] : 31536000;
  if (min > max || def > max || def < min)
    out.push({
      severity: "high",
      message: `TTLs are inconsistent: MinTTL ${min}, DefaultTTL ${def}, MaxTTL ${max}.`,
    });
  if (def === 0 && max === 0)
    out.push({
      severity: "info",
      message: "Caching is effectively disabled (TTLs of 0); this is a pass-through.",
    });
  if (p["EnableAcceptEncodingGzip"] !== true && p["EnableAcceptEncodingBrotli"] !== true)
    out.push({
      severity: "low",
      message:
        "Compression is not enabled in the cache key; compressed and uncompressed variants are not both served efficiently.",
    });
  return out;
}

export const STATUS_HINTS: Record<string, { title: string; causes: string[] }> = {
  "400": {
    title: "400 Bad Request",
    causes: [
      "A malformed request, or a request CloudFront could not match to a host (alternate domain name not on the distribution).",
      "A header or URL too large for the origin.",
    ],
  },
  "403": {
    title: "403 Forbidden",
    causes: [
      "An S3 origin without origin access control, or a bucket policy that does not allow the distribution.",
      "A missing S3 object when the caller lacks list permission: S3 returns 403 instead of 404.",
      "A signed URL or cookie that expired or was signed with the wrong key.",
      "A web ACL rule, a geographic restriction, or an origin that rejects CloudFront.",
      "The alternate domain name or the certificate does not match the host requested.",
    ],
  },
  "404": {
    title: "404 Not Found",
    causes: [
      "The object or path does not exist at the origin; check the origin path prefix and the case of the key.",
      "A single-page application that needs a custom error response mapping 404 to index.html.",
    ],
  },
  "502": {
    title: "502 Bad Gateway",
    causes: [
      "CloudFront could not connect to the origin: TLS handshake or certificate name mismatch, or the origin closed the connection.",
      "A Lambda@Edge function returned an invalid response, or its DNS resolution of the origin failed.",
      "The origin returned a malformed response.",
    ],
  },
  "503": {
    title: "503 Service Unavailable",
    causes: [
      "The origin is overloaded or unavailable, or a Lambda@Edge function exceeded a limit.",
    ],
  },
  "504": {
    title: "504 Gateway Timeout",
    causes: [
      "The origin did not respond within the origin response timeout; check origin latency and the timeout setting.",
      "A security group or network ACL at the origin blocks CloudFront.",
    ],
  },
};
