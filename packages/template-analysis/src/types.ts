export interface ResourceInfo {
  logicalId: string;
  type: string;
  properties: Record<string, unknown>;
  deletionPolicy: string | null;
  updateReplacePolicy: string | null;
  dependsOn: string[];
  condition: string | null;
  metadata: Record<string, unknown>;
}

export interface Template {
  resources: Record<string, ResourceInfo>;
  parameters: Record<string, unknown>;
  outputs: Record<string, unknown>;
  conditions: Record<string, unknown>;
  /** The parsed document, for rules that need a part this model does not carry. */
  raw: Record<string, unknown>;
}

export type ParseResult = { ok: true; template: Template } | { ok: false; error: string };

export interface Edge {
  from: string;
  to: string;
  via: "ref" | "getatt" | "sub" | "dependson";
}
