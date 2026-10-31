export interface DockerIssue {
  level: "error" | "warning" | "info";
  line: number;
  message: string;
}

const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;

function instructions(text: string): Array<{ line: number; op: string; args: string }> {
  const out: Array<{ line: number; op: string; args: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    let current = (lines[i] ?? "").trim();
    if (current === "" || current.startsWith("#")) continue;
    const start = i + 1;
    while (current.endsWith("\\") && i + 1 < lines.length) {
      i += 1;
      current = `${current.slice(0, -1).trim()} ${(lines[i] ?? "").trim()}`;
    }
    const space = current.indexOf(" ");
    out.push({
      line: start,
      op: (space < 0 ? current : current.slice(0, space)).toUpperCase(),
      args: space < 0 ? "" : current.slice(space + 1).trim(),
    });
  }
  return out;
}

export function reviewDockerfile(text: string): DockerIssue[] {
  const issues: DockerIssue[] = [];
  const ins = instructions(text);
  if (ins.length === 0)
    return [{ level: "error", line: 1, message: "the Dockerfile has no instructions" }];
  const froms = ins.filter((i) => i.op === "FROM");
  if (froms.length === 0) issues.push({ level: "error", line: 1, message: "no FROM instruction" });
  const stages = new Set<string>();
  for (const f of froms) {
    const m = /^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(f.args);
    const image = m?.[1] ?? "";
    if (m?.[2] !== undefined) stages.add(m[2].toLowerCase());
    if (image !== "scratch" && !stages.has(image.toLowerCase())) {
      if (!image.includes("@sha256:") && (!image.includes(":") || image.endsWith(":latest")))
        issues.push({
          level: "warning",
          line: f.line,
          message: `base image ${image} has no pinned tag; use a version tag, or a digest for reproducible builds`,
        });
    }
  }
  if (!ins.some((i) => i.op === "USER"))
    issues.push({
      level: "warning",
      line: 1,
      message:
        "no USER instruction: the container runs as root; create and switch to an unprivileged user",
    });
  else {
    const last = [...ins].reverse().find((i) => i.op === "USER");
    if (last !== undefined && /^(root|0)(:|$)/.test(last.args))
      issues.push({ level: "warning", line: last.line, message: "the final USER is root" });
  }
  if (froms.length === 1)
    issues.push({
      level: "info",
      line: 1,
      message:
        "single-stage build: build tools and sources stay in the final image; a multi-stage build keeps the image smaller and with fewer vulnerabilities",
    });
  for (const i of ins) {
    if (i.op === "ADD" && /^https?:\/\//.test(i.args.split(/\s+/)[0] ?? ""))
      issues.push({
        level: "warning",
        line: i.line,
        message:
          "ADD from a URL is not verified; download with curl, check a checksum, and COPY, or use a build stage",
      });
    if (i.op === "RUN" && /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba)?sh\b/.test(i.args))
      issues.push({
        level: "error",
        line: i.line,
        message: "piping a download into a shell runs unverified code during the build",
      });
    if (i.op === "ENV" || i.op === "ARG") {
      const name = i.args.split(/[=\s]/)[0] ?? "";
      const hasValue = /^[^=\s]+=\S+/.test(i.args) || /^[^=\s]+\s+\S+/.test(i.args);
      if (SECRET_NAME.test(name) && hasValue)
        issues.push({
          level: "error",
          line: i.line,
          message: `${i.op} ${name.slice(0, 40)} looks like a secret with a value: it is stored in the image layers and history. Use BuildKit secrets or inject it at run time.`,
        });
    }
    if (i.op === "RUN" && /apt-get install/.test(i.args) && !/--no-install-recommends/.test(i.args))
      issues.push({
        level: "info",
        line: i.line,
        message:
          "apt-get install without --no-install-recommends adds packages you did not ask for",
      });
    if (
      i.op === "RUN" &&
      /apt-get (update|install)/.test(i.args) &&
      !/rm -rf \/var\/lib\/apt\/lists/.test(i.args)
    )
      issues.push({
        level: "info",
        line: i.line,
        message: "apt lists are not removed in the same RUN, so they stay in the layer",
      });
    if (
      i.op === "COPY" &&
      /^\.\s+\./.test(i.args) &&
      ins.findIndex((x) => x === i) <
        ins.findIndex(
          (x) => x.op === "RUN" && /(npm (ci|install)|pip install|yarn|pnpm)/.test(x.args),
        )
    )
      issues.push({
        level: "info",
        line: i.line,
        message:
          "COPY . . comes before the dependency install, so every code change reinstalls dependencies; copy the manifest and install first",
      });
  }
  if (!ins.some((i) => i.op === "HEALTHCHECK"))
    issues.push({
      level: "info",
      line: 1,
      message:
        "no HEALTHCHECK. ECS uses the task definition's health check or the load balancer's, so this may be fine on ECS",
    });
  return issues;
}

export const DOCKERIGNORE = [
  "node_modules",
  ".git",
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "cdk.out",
  "dist",
  "coverage",
  "Dockerfile",
  ".dockerignore",
  "",
].join("\n");

export function nodeDockerfile(port: number): string {
  return `# syntax=docker/dockerfile:1
# Pin the base image by digest for reproducible builds: docker buildx imagetools inspect node:22-slim
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# Run as the unprivileged user the base image provides.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE ${port}
CMD ["node", "dist/index.js"]
`;
}

export const STOP_REASONS: Array<{ match: RegExp; title: string; causes: string[] }> = [
  {
    match: /CannotPullContainerError/i,
    title: "The image could not be pulled",
    causes: [
      "The image or tag does not exist in that repository and region.",
      "The task cannot reach ECR: in a private subnet it needs a NAT gateway or the ECR (api and dkr) and S3 gateway VPC endpoints.",
      "The execution role lacks ecr:GetAuthorizationToken, ecr:BatchGetImage, or ecr:GetDownloadUrlForLayer.",
      "The image architecture does not match the task (arm64 image on x86 or the reverse).",
    ],
  },
  {
    match: /OutOfMemory|exit code:? ?137|\b137\b/i,
    title: "The container was killed for memory (exit 137)",
    causes: [
      "The container hit its memory limit. Compare the peak memory use with the task and container limits.",
      "A memory leak, or a workload larger than the size chosen.",
      "Exit 137 can also be a SIGKILL from a deployment stopping the task; check the stopped reason.",
    ],
  },
  {
    match: /Essential container in task exited/i,
    title: "An essential container stopped",
    causes: [
      "The process exited: read the container's exit code and its logs.",
      "A crash at start-up (missing environment variable, bad configuration, failed secret fetch).",
      "A health check that kills the container.",
    ],
  },
  {
    match: /ResourceInitializationError/i,
    title: "The task could not initialize",
    causes: [
      "It could not fetch a secret or parameter: execution role permission, wrong ARN, or no route to Secrets Manager or SSM.",
      "It could not create the log stream: the log group is missing or the execution role cannot write to it.",
      "No network route to the services the task needs at start-up.",
    ],
  },
  {
    match: /health ?check|failed ELB/i,
    title: "Health checks failed",
    causes: [
      "The health check path or port is wrong, or the application takes longer to start than the grace period.",
      "The security group does not allow the load balancer to reach the task port.",
      "The application returns a non-2xx/3xx status on the health path.",
    ],
  },
  {
    match: /exec format error|standard_init_linux|no matching manifest/i,
    title: "Architecture mismatch",
    causes: [
      "The image was built for a different CPU architecture than the task uses (build for linux/arm64 or linux/amd64 to match RuntimePlatform).",
    ],
  },
  {
    match: /Task stopped by user|ServiceSchedulerInitiated|Scaling activity/i,
    title: "Stopped by a person or the service",
    causes: [
      "A deployment replaced the task, a scale-in removed it, or someone stopped it. Not a failure by itself.",
    ],
  },
];
