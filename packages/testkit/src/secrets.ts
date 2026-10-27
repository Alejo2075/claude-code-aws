/**
 * Patterns for strings that must never appear in hook output, reports, or persisted state.
 * The list is deliberately conservative: a match fails a test, so false positives are cheap
 * and false negatives are not.
 */
const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  {
    name: "aws-secret-access-key-assignment",
    pattern: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/i,
  },
  {
    name: "aws-session-token-assignment",
    pattern: /aws_session_token\s*[=:]\s*["']?[A-Za-z0-9/+=]{100,}/i,
  },
  { name: "private-key-block", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: "anthropic-api-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
];

export interface SecretFinding {
  readonly name: string;
  /** Index of the match in the scanned text. The matched value itself is never returned. */
  readonly index: number;
}

export function findSecretLikeStrings(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = pattern.exec(text);
    if (match) findings.push({ name, index: match.index });
  }
  return findings;
}
