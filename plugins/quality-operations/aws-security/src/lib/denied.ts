// Explains an AWS "not authorized" message by reading what the message itself says. It does not call
// AWS and does not guess: when the message does not name a cause, it says so.
export type DeniedCause =
  | "no-identity-policy"
  | "no-resource-policy"
  | "no-scp"
  | "no-permissions-boundary"
  | "no-session-policy"
  | "no-vpc-endpoint-policy"
  | "explicit-deny-identity"
  | "explicit-deny-resource"
  | "explicit-deny-scp"
  | "explicit-deny-rcp"
  | "explicit-deny-boundary"
  | "explicit-deny-session"
  | "unknown";

export interface DeniedExplanation {
  parsed: boolean;
  principal: string | null;
  action: string | null;
  resource: string | null;
  cause: DeniedCause;
  explanation: string;
  /** Where to look, in order. */
  checks: string[];
  /** A starting point for the missing statement. Only for an implicit deny in an identity policy. */
  proposal: { Effect: "Allow"; Action: string[]; Resource: string[] } | null;
  caveats: string[];
}

const CAUSES: Array<{ test: RegExp; cause: DeniedCause; text: string; checks: string[] }> = [
  {
    test: /explicit deny in a service control policy/i,
    cause: "explicit-deny-scp",
    text: "A service control policy of the organization explicitly denies this action.",
    checks: [
      "Ask the organization administrator which SCP denies it.",
      "An Allow in any policy of this account cannot override an SCP deny.",
    ],
  },
  {
    test: /explicit deny in a resource control policy/i,
    cause: "explicit-deny-rcp",
    text: "A resource control policy of the organization explicitly denies this.",
    checks: [
      "Ask the organization administrator for the RCP.",
      "An Allow in this account cannot override it.",
    ],
  },
  {
    test: /explicit deny in a permissions boundary/i,
    cause: "explicit-deny-boundary",
    text: "The permissions boundary explicitly denies this action.",
    checks: ["Read the permissions boundary attached to the role or user."],
  },
  {
    test: /explicit deny in a session policy/i,
    cause: "explicit-deny-session",
    text: "A session policy used when the role was assumed explicitly denies this action.",
    checks: ["Check the policy passed to AssumeRole."],
  },
  {
    test: /explicit deny in a resource-based policy/i,
    cause: "explicit-deny-resource",
    text: "The resource's own policy explicitly denies this.",
    checks: [
      "Read the resource policy (bucket, queue, key, ...) for a Deny that matches the principal.",
    ],
  },
  {
    test: /explicit deny in an identity-based policy/i,
    cause: "explicit-deny-identity",
    text: "A policy attached to the principal explicitly denies this action.",
    checks: [
      "Search the principal's policies, its groups' policies, and managed policies for a Deny that matches the action and resource.",
      "An explicit deny always wins: adding an Allow will not help.",
    ],
  },
  {
    test: /no service control policy allows/i,
    cause: "no-scp",
    text: "No service control policy of the organization allows this action.",
    checks: [
      "Ask the organization administrator whether an SCP allows it; SCPs limit the whole account.",
    ],
  },
  {
    test: /no permissions boundary allows/i,
    cause: "no-permissions-boundary",
    text: "The permissions boundary does not allow this action, so the identity policy alone is not enough.",
    checks: [
      "Read the permissions boundary: the action must be allowed by both it and the identity policy.",
    ],
  },
  {
    test: /no session policy allows/i,
    cause: "no-session-policy",
    text: "A session policy narrowed the permissions and does not allow this action.",
    checks: ["Check the policy passed to AssumeRole or GetFederationToken."],
  },
  {
    test: /no VPC endpoint policy allows/i,
    cause: "no-vpc-endpoint-policy",
    text: "The VPC endpoint policy does not allow this action.",
    checks: ["Read the policy of the VPC endpoint the request goes through."],
  },
  {
    test: /no resource-based policy allows/i,
    cause: "no-resource-policy",
    text: "The resource's policy does not allow this principal. Cross-account access needs both sides to allow it.",
    checks: [
      "Add the principal to the resource policy.",
      "If the principal is in another account, its own identity policy must also allow the action.",
    ],
  },
  {
    test: /no identity-based policy allows/i,
    cause: "no-identity-policy",
    text: "No policy attached to the principal allows this action.",
    checks: [
      "Add an Allow for the action, scoped to the resource, to the role's policy.",
      "If an SCP or a permissions boundary also applies, it must allow the action too.",
    ],
  },
];

const MESSAGE =
  /(?:User|Role): (arn:\S+) is not authorized to perform: (\S+?)(?: on resource: (\S+?))?(?: because |\s+with an explicit deny|\.|$)/i;

/** Parses and explains a not-authorized message. */
export function explainDenied(message: string): DeniedExplanation {
  const text = message.slice(0, 4000);
  const parsed = MESSAGE.exec(text);
  const found = CAUSES.find((candidate) => candidate.test.test(text));
  if (parsed === null) {
    return {
      parsed: false,
      principal: null,
      action: null,
      resource: null,
      cause: found?.cause ?? "unknown",
      explanation:
        found?.text ??
        "The message does not name the principal and the action, so the cause cannot be read from it.",
      checks: found?.checks ?? [
        'Paste the complete error message, including the part that starts with "User:" or "Role:".',
        'Some services (for example Amazon S3 for some requests) return a bare "Access Denied" without a cause; CloudTrail shows the requested action and the error.',
      ],
      proposal: null,
      caveats: ["Nothing was changed and AWS was not contacted."],
    };
  }
  const [, principal = null, action = null, resource = null] = parsed;
  const cause = found?.cause ?? "unknown";
  const proposal =
    cause === "no-identity-policy" && action !== null
      ? { Effect: "Allow" as const, Action: [action], Resource: [resource ?? "<the resource ARN>"] }
      : null;
  return {
    parsed: true,
    principal,
    action,
    resource,
    cause,
    explanation: found?.text ?? "The message does not say which kind of policy denied the request.",
    checks: found?.checks ?? [
      "Check the identity-based policy, then any permissions boundary, session policy, resource policy, and service control policy.",
    ],
    proposal,
    caveats: [
      "This reads the message only. It cannot see the actual policies, so it cannot say whether the proposed statement is sufficient.",
      ...(proposal === null
        ? []
        : [
            "The proposal is a starting point: check that the resource ARN is the narrowest that works, and add conditions where they apply.",
          ]),
      "Nothing was changed and AWS was not contacted.",
    ],
  };
}
