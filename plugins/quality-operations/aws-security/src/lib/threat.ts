// A threat model from the declared architecture. Every threat here is a HYPOTHESIS built from facts
// in the templates (entry points, authorization, permissions, reachable stores); none is a finding
// that something is exploitable. The attack paths follow edges the templates declare or imply.
import {
  type ArchitectureGraph,
  fromStacks,
  type GraphEdge,
} from "@claude-code-aws/architecture-graph";
import { type Finding, makeFinding } from "@claude-code-aws/report-contract";
import type { Template } from "@claude-code-aws/template-analysis";

import { authMatrix } from "./auth.js";

const PLUGIN = "aws-security";
const ENTRY_KINDS = new Set(["http-api", "rest-api", "distribution", "graphql-api"]);
const STORE_KINDS = new Set(["table", "bucket", "secret", "stream", "queue"]);

export interface AttackPath {
  entry: string;
  via: string[];
  edges: Array<{ from: string; to: string; label: string; basis: GraphEdge["basis"] }>;
  reaches: string;
}

export interface ThreatModel {
  graph: ArchitectureGraph;
  boundaries: string[];
  entryPoints: Array<{ id: string; kind: string; unauthenticatedRoutes: number }>;
  paths: AttackPath[];
  findings: Finding[];
}

function pathsFrom(graph: ArchitectureGraph, entry: string, limit: number): AttackPath[] {
  const out: AttackPath[] = [];
  const adjacency = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e]);
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const walk = (node: string, trail: GraphEdge[], seen: Set<string>): void => {
    if (out.length >= limit || trail.length > 6) return;
    for (const e of adjacency.get(node) ?? []) {
      if (seen.has(e.to)) continue;
      const next = [...trail, e];
      if (STORE_KINDS.has(kinds.get(e.to) ?? ""))
        out.push({
          entry,
          via: next.slice(0, -1).map((x) => x.to),
          edges: next.map((x) => ({ from: x.from, to: x.to, label: x.label, basis: x.basis })),
          reaches: e.to,
        });
      walk(e.to, next, new Set([...seen, e.to]));
    }
  };
  walk(entry, [], new Set([entry]));
  return out;
}

export function threatModel(
  stacks: ReadonlyArray<{ name: string; template: Template }>,
): ThreatModel {
  const graph = fromStacks(stacks);
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const entryPoints: ThreatModel["entryPoints"] = [];
  const findings: Finding[] = [];
  const paths: AttackPath[] = [];
  const open = new Map<string, number>();
  for (const s of stacks) {
    for (const row of authMatrix(s.template).rows) {
      if (row.authorization === "NONE" && !row.apiKeyRequired) {
        const id = `${s.name}/${row.api}`;
        open.set(id, (open.get(id) ?? 0) + 1);
      }
    }
  }
  for (const n of graph.nodes) {
    if (!ENTRY_KINDS.has(n.kind)) continue;
    const unauth = open.get(n.id) ?? 0;
    entryPoints.push({ id: n.id, kind: n.kind, unauthenticatedRoutes: unauth });
    const reach = pathsFrom(graph, n.id, 10);
    paths.push(...reach);
    if (unauth > 0)
      findings.push(
        makeFinding({
          ruleId: "SEC-TM-OPEN-ENTRY",
          plugin: PLUGIN,
          severity: reach.length > 0 ? "high" : "medium",
          status: "hypothesis",
          source: "static",
          title: `${n.label} has ${unauth} route(s) callable without authorization${reach.length > 0 ? " and reaches stored data" : ""}`,
          explanation: `Spoofing and elevation of privilege: anyone on the internet can call these routes${reach.length > 0 ? `, and the declared paths from ${n.label} reach ${[...new Set(reach.map((p) => p.reaches))].map((r) => kinds.get(r) ?? "resource").join(", ")} resources` : ""}. Whether this is intended depends on the route (a public health check is not a threat).`,
          affectedResources: [n.id],
          subject: n.id,
          recommendation:
            "Attach an authorizer to every route that is not meant to be public, and limit what the backing function can reach.",
          evidence: [{ type: "template", reference: n.id }],
        }),
      );
  }
  for (const p of paths.filter((x) => x.edges.some((e) => e.basis === "inferred"))) {
    findings.push(
      makeFinding({
        ruleId: "SEC-TM-BLAST-RADIUS",
        plugin: PLUGIN,
        severity: "low",
        status: "hypothesis",
        source: "static",
        title: `${p.entry} can reach ${p.reaches} through ${p.via.join(" -> ") || "a direct link"}`,
        explanation:
          "Tampering and information disclosure: if code behind this entry point is compromised, its permissions let it reach this resource. The link is inferred from permissions or environment variables, so it shows what is possible, not what the code does.",
        affectedResources: [p.entry, p.reaches],
        subject: `${p.entry}>${p.reaches}`,
        recommendation:
          "Scope the role to the actions and ARNs the code uses, and split functions so a public-facing one cannot reach data it does not need.",
        evidence: p.edges.map((e) => ({
          type: "template",
          reference: `${e.from} -> ${e.to} (${e.label}, ${e.basis})`,
        })),
      }),
    );
  }
  for (const n of graph.nodes) {
    if (n.kind === "queue" || n.kind === "topic") {
      const inbound = graph.edges.filter((e) => e.to === n.id);
      if (inbound.length === 0 && stacks.length > 0) continue;
    }
  }
  const boundaries = [
    "internet",
    ...new Set(graph.nodes.flatMap((x) => (x.group === undefined ? [] : [`stack ${x.group}`]))),
  ];
  return { graph, boundaries, entryPoints, paths, findings };
}

export const STRIDE_NOTE =
  "STRIDE here is a prompt for questions, not a checklist of findings: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. This model only knows what the templates declare. Application logic, data flows inside code, third parties, and people are outside it, so ask the team what is missing.";

/** Proposals for fixing findings. Nothing is applied; each proposal says how to check it worked. */
const REMEDIATIONS: Record<string, { change: string; verify: string }> = {
  "SEC-IAM-WILDCARD-ACTION": {
    change:
      "Replace the wildcard action with the list of actions the code calls. In CDK prefer grant methods (table.grantReadData(fn)) over hand-written policy statements.",
    verify:
      "Re-run /aws-security:iam; run the tests; use the AccessDenied explainer if something breaks.",
  },
  "SEC-IAM-WILDCARD-RESOURCE": {
    change: "Name the ARNs (or use grant methods) instead of '*'.",
    verify: "Re-run /aws-security:iam.",
  },
  "SEC-IAM-SERVICE-WILDCARD": {
    change:
      "List the specific actions of the service (for example dynamodb:GetItem, dynamodb:Query) instead of 'service:*'.",
    verify: "Re-run /aws-security:iam.",
  },
  "SEC-S3-PUBLIC-ACCESS-BLOCK": {
    change:
      "In CDK: new s3.Bucket(this, 'B', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL }). Serve public content through CloudFront with origin access control.",
    verify: "/aws-storage:inspect shows no STO-NO-PUBLIC-BLOCK.",
  },
  "SEC-S3-SSL-NOT-ENFORCED": {
    change: "In CDK: new s3.Bucket(this, 'B', { enforceSSL: true }).",
    verify: "/aws-storage:inspect shows no STO-NO-TLS-ONLY.",
  },
  "SEC-LAMBDA-URL-NO-AUTH": {
    change:
      "Use authType AWS_IAM on the function URL, or put the function behind API Gateway with an authorizer.",
    verify: "An unauthenticated request returns 403.",
  },
  "SEC-LAMBDA-SECRET-ENV": {
    change:
      "Store the secret in Secrets Manager and pass only its name or ARN in the environment; read it at run time and grant read on that one secret.",
    verify: "/aws-lambda:inspect shows no LMB-SECRET-IN-ENV.",
  },
  "SEC-LAMBDA-RUNTIME-UNSUPPORTED": {
    change: "Change the runtime to a supported one, run the tests, and deploy through /aws-deploy.",
    verify: "/aws-lambda:inspect shows no LMB-RUNTIME.",
  },
  "SEC-APIGW-UNAUTHENTICATED-ROUTE": {
    change:
      "Attach a JWT or IAM authorizer to the route (HttpJwtAuthorizer in CDK) unless it is deliberately public.",
    verify: "An unauthenticated request to the route returns 401 or 403.",
  },
  "SEC-APIGW-CORS-WILDCARD": {
    change: "List the exact origins in the CORS configuration.",
    verify: "/aws-api:inspect shows no API-CORS-WILDCARD.",
  },
  "SEC-SNS-NO-ENCRYPTION": {
    change: "Set a KMS key on the topic (masterKey in CDK).",
    verify: "/aws-messaging:inspect shows no MSG-TOPIC-NOT-ENCRYPTED.",
  },
  "SEC-KMS-NO-ROTATION": {
    change: "Set enableKeyRotation: true on the key.",
    verify: "Re-run /aws-security:audit.",
  },
  "SEC-COGNITO-NO-MFA": {
    change: "Set mfa to REQUIRED or OPTIONAL on the user pool, with a second factor enabled.",
    verify: "/aws-auth:inspect shows no AUTH-NO-MFA.",
  },
};

export function remediation(
  ruleId: string,
  recommendation: string | undefined,
): { change: string; verify: string } {
  const known = Object.hasOwn(REMEDIATIONS, ruleId) ? REMEDIATIONS[ruleId] : undefined;
  return (
    known ?? {
      change:
        recommendation ??
        "Follow the rule's documentation link; no specific change is proposed for this rule.",
      verify: "Re-run /aws-security:audit and confirm the finding is gone.",
    }
  );
}
