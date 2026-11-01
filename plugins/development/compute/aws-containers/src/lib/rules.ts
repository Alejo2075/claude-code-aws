import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

import { checkFargateSize } from "./fargate.js";

const PLUGIN = "aws-containers";
const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(isRecord) : [];
const txt = (v: unknown, fallback: string): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : fallback;

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const d of resourcesOfType(t, "AWS::ECS::TaskDefinition"))
    rows.push({
      kind: "task-def",
      id: `${stack}/${d.logicalId}`,
      detail: `${txt(d.properties["Cpu"], "?")} CPU / ${txt(d.properties["Memory"], "?")} MiB, ${list(d.properties["ContainerDefinitions"]).length} container(s), network ${txt(d.properties["NetworkMode"], "default")}`,
    });
  for (const s of resourcesOfType(t, "AWS::ECS::Service"))
    rows.push({
      kind: "service",
      id: `${stack}/${s.logicalId}`,
      detail: `${txt(s.properties["LaunchType"], "capacity provider")}, desired ${txt(s.properties["DesiredCount"], "1")}`,
    });
  for (const r of resourcesOfType(t, "AWS::ECR::Repository"))
    rows.push({
      kind: "repository",
      id: `${stack}/${r.logicalId}`,
      detail: `tags ${txt(r.properties["ImageTagMutability"], "MUTABLE")}`,
    });
  return rows;
}

/** Task definition checks shared by the template and by a task definition JSON file. `p` uses PascalCase keys. */
export function taskChecks(id: string, p: Record<string, unknown>): Finding[] {
  const out: Finding[] = [];
  const add = (f: Parameters<typeof staticFinding>[1]): void => {
    out.push(staticFinding(PLUGIN, f));
  };
  const compat = Array.isArray(p["RequiresCompatibilities"]) ? p["RequiresCompatibilities"] : [];
  const fargate = compat.includes("FARGATE");
  if (fargate) {
    const cpu = Number(p["Cpu"]);
    const mem = Number(p["Memory"]);
    if (Number.isFinite(cpu) && Number.isFinite(mem)) {
      const problem = checkFargateSize(cpu, mem);
      if (problem !== null)
        add({
          ruleId: "CNT-FARGATE-SIZE",
          severity: "high",
          title: "Invalid Fargate CPU and memory combination",
          explanation: problem,
          subject: id,
          resources: [id],
        });
    } else
      add({
        ruleId: "CNT-FARGATE-SIZE",
        severity: "high",
        title: "A Fargate task needs task-level Cpu and Memory",
        explanation: "Fargate requires CPU and memory at the task level.",
        subject: id,
        resources: [id],
      });
    if (p["ExecutionRoleArn"] === undefined)
      add({
        ruleId: "CNT-NO-EXECUTION-ROLE",
        severity: "medium",
        title: "No task execution role",
        explanation:
          "Pulling from ECR, writing logs, and reading secrets all use the execution role.",
        subject: id,
        resources: [id],
      });
  }
  if (p["TaskRoleArn"] === undefined)
    add({
      ruleId: "CNT-NO-TASK-ROLE",
      severity: "info",
      title: "No task role",
      explanation:
        "Fine if the code calls no AWS API. If it does, it will fail or fall back to a broader role.",
      subject: id,
      resources: [id],
    });
  for (const c of list(p["ContainerDefinitions"])) {
    const name = txt(c["Name"], "container");
    const where = `${id}:${name}`;
    const image =
      typeof c["Image"] === "string"
        ? c["Image"]
        : isRecord(c["Image"])
          ? "(built by the template)"
          : "";
    if (image !== "" && image !== "(built by the template)") {
      const digest = image.includes("@sha256:");
      const tag = image.split("/").pop()?.split(":")[1];
      if (!digest && (tag === undefined || tag === "latest"))
        add({
          ruleId: "CNT-IMAGE-TAG",
          severity: "medium",
          title: `Container ${name} uses ${tag === undefined ? "no tag" : "the latest tag"}`,
          explanation:
            "The image can change under the same name, so a restart can run different code than was tested, and a rollback cannot go back.",
          subject: where,
          resources: [id],
          recommendation: "Pin a version tag, or better a digest (@sha256:...).",
        });
    }
    if (!isRecord(c["LogConfiguration"]))
      add({
        ruleId: "CNT-NO-LOGS",
        severity: "medium",
        title: `Container ${name} has no log configuration`,
        explanation: "Its output is lost when the task stops, which is when you need it.",
        subject: where,
        resources: [id],
        recommendation:
          "Add an awslogs log configuration with a log group that has a retention period.",
      });
    for (const e of list(c["Environment"]))
      if (typeof e["Name"] === "string" && SECRET_NAME.test(e["Name"]))
        add({
          ruleId: "CNT-SECRET-IN-ENV",
          severity: "high",
          title: `Container ${name} sets ${e["Name"]} as a plain environment value`,
          explanation:
            "Plain environment values are stored in the task definition, visible to anyone who can read it, and kept in its revisions.",
          subject: `${where}:${e["Name"]}`,
          resources: [id],
          recommendation: "Use the Secrets list (valueFrom Secrets Manager or SSM) instead.",
        });
    if (c["Privileged"] === true)
      add({
        ruleId: "CNT-PRIVILEGED",
        severity: "high",
        title: `Container ${name} is privileged`,
        explanation:
          "A privileged container has most of the host's capabilities, and Fargate does not allow it.",
        subject: where,
        resources: [id],
      });
    if (c["ReadonlyRootFilesystem"] !== true)
      add({
        ruleId: "CNT-WRITABLE-ROOT",
        severity: "info",
        title: `Container ${name} has a writable root file system`,
        explanation:
          "A read-only root file system limits what a compromised process can change; give it a volume for the paths it must write.",
        subject: where,
        resources: [id],
      });
    if (c["User"] === undefined)
      add({
        ruleId: "CNT-RUNS-AS-ROOT",
        severity: "low",
        status: "hypothesis",
        title: `Container ${name} does not set a user`,
        explanation:
          "It runs as whatever the image defines, often root. Check the Dockerfile's USER.",
        subject: where,
        resources: [id],
      });
    if (!isRecord(c["HealthCheck"]))
      add({
        ruleId: "CNT-NO-HEALTHCHECK",
        severity: "info",
        title: `Container ${name} has no container health check`,
        explanation:
          "ECS cannot tell a hung process from a healthy one unless a load balancer checks it.",
        subject: where,
        resources: [id],
      });
  }
  return out;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const d of resourcesOfType(t, "AWS::ECS::TaskDefinition"))
    out.push(...taskChecks(at(d.logicalId), d.properties));
  for (const s of resourcesOfType(t, "AWS::ECS::Service")) {
    const id = at(s.logicalId);
    const net =
      isRecord(s.properties["NetworkConfiguration"]) &&
      isRecord(s.properties["NetworkConfiguration"]["AwsvpcConfiguration"])
        ? s.properties["NetworkConfiguration"]["AwsvpcConfiguration"]
        : null;
    if (net !== null && net["AssignPublicIp"] === "ENABLED")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CNT-PUBLIC-IP",
          severity: "low",
          title: "Tasks get public IP addresses",
          explanation:
            "Tasks are reachable from the internet if the security group allows it. Use private subnets behind a load balancer unless tasks must pull images without NAT or VPC endpoints.",
          subject: id,
          resources: [id],
        }),
      );
    const dc = s.properties["DeploymentConfiguration"];
    if (!(
      isRecord(dc) &&
      isRecord(dc["DeploymentCircuitBreaker"]) &&
      dc["DeploymentCircuitBreaker"]["Enable"] === true
    ))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CNT-NO-CIRCUIT-BREAKER",
          severity: "low",
          title: "Deployment circuit breaker is off",
          explanation:
            "A deployment whose tasks keep failing is retried indefinitely instead of rolling back.",
          subject: id,
          resources: [id],
          recommendation: "Enable DeploymentCircuitBreaker with rollback.",
        }),
      );
  }
  for (const r of resourcesOfType(t, "AWS::ECR::Repository")) {
    const id = at(r.logicalId);
    const scan = r.properties["ImageScanningConfiguration"];
    if (!(isRecord(scan) && scan["ScanOnPush"] === true))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CNT-ECR-NO-SCAN",
          severity: "low",
          title: "Images are not scanned on push",
          explanation: "Known vulnerabilities in new images go unnoticed until someone scans them.",
          subject: id,
          resources: [id],
        }),
      );
    if (r.properties["ImageTagMutability"] !== "IMMUTABLE")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CNT-ECR-MUTABLE-TAGS",
          severity: "low",
          title: "Image tags can be overwritten",
          explanation: "A tag can be moved to different content after it was tested.",
          subject: id,
          resources: [id],
          recommendation: "Set ImageTagMutability to IMMUTABLE.",
        }),
      );
    if (r.properties["LifecyclePolicy"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CNT-ECR-NO-LIFECYCLE",
          severity: "low",
          title: "No lifecycle policy",
          explanation: "Old images accumulate and cost storage.",
          subject: id,
          resources: [id],
        }),
      );
  }
  return out;
}
