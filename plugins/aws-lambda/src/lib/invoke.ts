// Prepares an invocation as a command for a person to run. This plugin never invokes anything.
export const FUNCTION_NAME =
  /^(arn:aws[a-z-]*:lambda:[a-z0-9-]+:\d{12}:function:)?[A-Za-z0-9-_]{1,64}(:[A-Za-z0-9-_$]{1,128})?$/;
export const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
export const SYNC_LIMIT = 6 * 1024 * 1024;
export const ASYNC_LIMIT = 1024 * 1024;

export interface InvokePlan {
  ok: boolean;
  problems: string[];
  command: string;
  effects: string[];
  dryRunCommand: string;
}

export function planInvoke(input: {
  fn: string;
  region: string;
  payloadFile: string;
  payloadBytes: number;
  async: boolean;
  qualifier?: string;
}): InvokePlan {
  const problems: string[] = [];
  if (!FUNCTION_NAME.test(input.fn)) problems.push("The function name or ARN is not valid.");
  if (!REGION.test(input.region)) problems.push("The region is not valid (for example us-east-1).");
  const limit = input.async ? ASYNC_LIMIT : SYNC_LIMIT;
  if (input.payloadBytes > limit)
    problems.push(
      `The payload is ${input.payloadBytes} bytes; a${input.async ? "n asynchronous" : " synchronous"} invocation allows at most ${limit} bytes.`,
    );
  if (input.qualifier !== undefined && !/^[A-Za-z0-9-_$]{1,128}$/.test(input.qualifier))
    problems.push("The qualifier (version or alias) is not valid.");
  const q = input.qualifier === undefined ? "" : ` --qualifier ${input.qualifier}`;
  const base = `aws lambda invoke --function-name ${input.fn} --region ${input.region}${q} --cli-binary-format raw-in-base64-out --payload fileb://${input.payloadFile}`;
  return {
    ok: problems.length === 0,
    problems,
    command: `${base} --invocation-type ${input.async ? "Event" : "RequestResponse"} response.json`,
    dryRunCommand: `${base} --invocation-type DryRun response.json`,
    effects: [
      "Invoking runs your code with the function's role: it can read and write whatever that role allows, send messages, charge cards, and so on.",
      input.async
        ? "An asynchronous invocation returns immediately; failures are retried and may run the code more than once."
        : "A synchronous invocation waits for the result and bills the full duration.",
      "You pay for the invocation. Use a version or alias in a sandbox account, not production data.",
      "Run the DryRun form first: it checks that the parameters are valid and that you have permission, without running the function.",
    ],
  };
}

export const TOPICS: Record<string, { title: string; points: string[]; source: string }> = {
  "memory-cpu": {
    title: "Memory and CPU",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "Memory is 128 to 10,240 MB. CPU is allocated in proportion to memory: at 1,769 MB a function has the equivalent of one vCPU.",
      "More memory can lower duration enough to lower cost; the only way to know is to measure at several sizes (/aws-cost:compare lambda-memory).",
      "Memory also sets network bandwidth for functions whose limit was raised; see the quotas page.",
    ],
  },
  timeout: {
    title: "Timeout",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "The maximum is 900 seconds (15 minutes).",
      "Set the timeout to what the work needs plus a margin, not the maximum: a hung call then costs less.",
      "For a queue consumer, set the queue's visibility timeout to at least six times the function timeout.",
    ],
  },
  "cold-start": {
    title: "Cold starts",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html",
    points: [
      "A cold start is the initialization of a new execution environment: it runs on the first request after idle time and when concurrency scales up.",
      "Create SDK clients outside the handler so warm invocations reuse them.",
      "Reduce package size and imports. Provisioned concurrency or SnapStart (where the runtime supports it) trade cost for fewer cold starts; measure init duration first.",
    ],
  },
  architecture: {
    title: "x86_64 or arm64",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html",
    points: [
      "arm64 (Graviton) is often cheaper per unit of work; dependencies with native code must be built for arm64.",
      "Test on arm64 before switching. Lambda@Edge does not support arm64.",
    ],
  },
  vpc: {
    title: "VPC access",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html",
    points: [
      "A function in a VPC has no internet access unless the subnets route through a NAT gateway; AWS services are reached through VPC endpoints or the NAT.",
      "Only attach a function to a VPC if it must reach resources in it (for example a database).",
      "For relational databases, mind connection counts: use a proxy or reuse connections.",
    ],
  },
  concurrency: {
    title: "Concurrency",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html",
    points: [
      "Each concurrent request uses one execution environment; the function scales by up to 1,000 environments every 10 seconds.",
      "Reserved concurrency caps a function (and keeps that share for it); provisioned concurrency keeps environments warm.",
      "Cap functions that call fragile downstream systems so a spike cannot overwhelm them.",
    ],
  },
  versions: {
    title: "Versions and aliases",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html",
    points: [
      "A published version is immutable. An alias points to a version and can shift traffic between two.",
      "Invoke and trigger a version or alias in production, not $LATEST.",
      "Lambda@Edge needs a numbered version.",
    ],
  },
  limits: {
    title: "Hard limits to design around",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "Payload: 6 MB request and response (synchronous), 1 MB (asynchronous).",
      "Package: 50 MB zipped when uploaded directly, 250 MB unzipped including layers; container images up to 10 GB.",
      "Environment variables: 4 KB in total. Layers: 5. /tmp: 512 to 10,240 MB.",
    ],
  },
};
