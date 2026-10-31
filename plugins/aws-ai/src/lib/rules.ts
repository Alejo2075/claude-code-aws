import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { iamStatements, resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-ai";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

const TYPES: Record<string, string> = {
  "AWS::Bedrock::Agent": "agent",
  "AWS::Bedrock::KnowledgeBase": "knowledge-base",
  "AWS::Bedrock::Guardrail": "guardrail",
  "AWS::Bedrock::DataSource": "data-source",
  "AWS::Bedrock::AgentAlias": "agent-alias",
};

export function inventory(stack: string, t: Template): Row[] {
  return Object.values(t.resources)
    .filter((r) => TYPES[r.type] !== undefined)
    .map((r) => ({
      kind: TYPES[r.type] ?? r.type,
      id: `${stack}/${r.logicalId}`,
      detail:
        r.type === "AWS::Bedrock::Agent"
          ? `foundation model ${typeof r.properties["FoundationModel"] === "string" ? r.properties["FoundationModel"] : "(from template)"}`
          : "",
    }));
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  const guardrails = resourcesOfType(t, "AWS::Bedrock::Guardrail").length;
  for (const a of resourcesOfType(t, "AWS::Bedrock::Agent")) {
    const id = at(a.logicalId);
    if (!isRecord(a.properties["GuardrailConfiguration"]) && guardrails === 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-AGENT-NO-GUARDRAIL",
          severity: "medium",
          title: "Agent has no guardrail",
          explanation:
            "Nothing filters harmful content, denied topics, or sensitive information in what the agent reads and says.",
          subject: id,
          resources: [id],
          recommendation: "Attach a guardrail and test it with adversarial prompts.",
        }),
      );
    if (typeof a.properties["Instruction"] !== "string" || a.properties["Instruction"].length < 40)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-AGENT-THIN-INSTRUCTION",
          severity: "low",
          title: "Agent instruction is missing or very short",
          explanation:
            "The instruction is the agent's contract: what it may do, what it must refuse, and how to answer. A one-line instruction leaves the rest to chance.",
          subject: id,
          resources: [id],
        }),
      );
    if (a.properties["IdleSessionTTLInSeconds"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-AGENT-SESSION-TTL",
          severity: "info",
          title: "Session idle timeout is not set",
          explanation:
            "Conversations stay open for the default period; set it to what the product needs.",
          subject: id,
          resources: [id],
        }),
      );
  }
  for (const k of resourcesOfType(t, "AWS::Bedrock::KnowledgeBase")) {
    const id = at(k.logicalId);
    const cfg = isRecord(k.properties["KnowledgeBaseConfiguration"])
      ? k.properties["KnowledgeBaseConfiguration"]
      : {};
    const vec = isRecord(cfg["VectorKnowledgeBaseConfiguration"])
      ? cfg["VectorKnowledgeBaseConfiguration"]
      : {};
    if (vec["EmbeddingModelArn"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-KB-NO-EMBEDDING-MODEL",
          severity: "medium",
          title: "Knowledge base does not name an embedding model",
          explanation: "Retrieval quality and the vector dimensions depend on it.",
          subject: id,
          resources: [id],
        }),
      );
  }
  for (const d of resourcesOfType(t, "AWS::Bedrock::DataSource")) {
    const id = at(d.logicalId);
    const chunk = isRecord(d.properties["VectorIngestionConfiguration"])
      ? d.properties["VectorIngestionConfiguration"]["ChunkingConfiguration"]
      : undefined;
    if (chunk === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-DS-DEFAULT-CHUNKING",
          severity: "info",
          title: "Data source uses default chunking",
          explanation:
            "Chunk size and overlap strongly affect answer quality; choose them from your documents and measure retrieval.",
          subject: id,
          resources: [id],
        }),
      );
  }
  for (const s of iamStatements(t))
    if (
      s.effect === "Allow" &&
      s.kind === "identity" &&
      s.actions.some((a) => /^bedrock:(\*|InvokeModel.*)$/.test(a)) &&
      s.resources.includes("*")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AI-INVOKE-ANY-MODEL",
          severity: "medium",
          title: `${s.owner} can invoke any Bedrock model`,
          explanation:
            "A role with bedrock:InvokeModel on every resource can use models you did not choose or budget for, including expensive ones.",
          subject: s.owner,
          resources: [s.owner],
          recommendation:
            "Limit Resource to the ARN of the model (or inference profile) the application uses.",
        }),
      );
  return out;
}
