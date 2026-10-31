# aws-explorer

Browse CloudFormation and CDK stacks, their resources and events, and the properties of a resource, in one AWS account and region, from Claude Code. Read-only: it never changes anything in AWS.

## What it does

Answers "what is deployed here?" and "why did that deploy fail?" with evidence instead of guesses:

- **Stacks:** list them, and see one stack's status, parameters, outputs, tags, and drift status.
- **Resources and events:** what a stack contains, and what happened to it, newest first, with failures marked.
- **Properties:** the configuration of any resource type the [Cloud Control API](https://docs.aws.amazon.com/cloudcontrolapi/latest/userguide/supported-resources.html) supports, found by type and identifier, or through a stack and a logical id.

Every report starts with the account STS confirmed for that run, the region, and the time. It never switches profile, assumes a role, or signs in.

It does not deploy, update, delete, or invoke anything, and it does not wrap every AWS service: for what CloudFormation and Cloud Control do not cover, use the AWS CLI or the AWS MCP servers.

## Install

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install aws-explorer@claude-code-aws
```

## Prerequisites

- Claude Code 2.1.295 or later.
- Node.js 22 or later on `PATH`.
- AWS credentials resolved the usual way (profile, IAM Identity Center, environment variables, assumed role). The plugin never reads credential files itself; the AWS SDK does.

## Components

| Component | Name                    | Side effects                                            | Invocation                                |
| --------- | ----------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Skill     | `/aws-explorer:explore` | Read. Runs the commands below and summarizes the result | Automatic or manual                       |
| Command   | `dist/cli.mjs`          | Read-only AWS API calls. No writes anywhere             | Run by the skill; you can run it yourself |

```text
stacks [--status <status|active|all>[,...]]   List stacks (default: every stack that is not deleted)
stack <name or ARN>                           One stack: status, parameters, outputs, tags
resources <stack>                             The stack's resources
events <stack>                                The stack's events, newest first
resource <type> <identifier>                  Properties through Cloud Control, e.g. AWS::S3::Bucket my-bucket
resource --stack <stack> <logical id>         The same, looked up in a stack

--region <region>   --limit <1-500, default 50>   --json
```

## Limits and honesty

- **Bounded.** 50 items per list by default, 500 at most, and 20 seconds in total. A list that was cut says so. Throttled calls are retried with backoff, a few times.
- **One account, one region.** Nothing is searched across regions or accounts.
- **Absence proves nothing.** A short or empty list is not evidence that a resource does not exist: it may be in another region or account, outside your permissions, or deleted.
- **Identifiers.** For `resource --stack`, the stack's physical id is used as the Cloud Control identifier. For some types they differ, and the lookup then fails with `NOT_FOUND`; the report says so.
- **Coverage of Cloud Control.** Not every type supports reading. An unsupported type is reported as such.

## Secrets

Everything read from AWS is treated as untrusted data that may contain secrets:

- Values of properties, parameters, outputs, and tags whose **names** look like secrets (`password`, `token`, `secret`, `apiKey`, `privateKey`, `connectionString`, ...) are replaced by `[redacted]`.
- Environment variables (Lambda `Environment.Variables`, ECS and CodeBuild environment lists) keep their **names** and lose every value.
- Credential-shaped values are replaced wherever they appear: access key ids, private keys, JWTs, and common API tokens.
- Terminal escape sequences and control characters are removed from every string, so a stack name cannot repaint your terminal.
- Strings, lists, and nesting are size-bounded.

The report counts what it replaced. Redaction is pattern-based and can miss a secret stored under an innocent name, or hide a harmless value; for a value you need, read the original yourself in the console or CLI. CloudFormation `NoEcho` parameters are already masked by AWS.

## AWS permissions

Read permissions only. This policy covers the commands. Cloud Control's `GetResource` is authorized with the IAM action `cloudformation:GetResource` (see [Cloud Control API security](https://docs.aws.amazon.com/cloudcontrolapi/latest/userguide/security.html)), and reading a resource also needs the underlying service's read permission for that type, for example `lambda:GetFunction`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:ListStacks",
        "cloudformation:DescribeStacks",
        "cloudformation:ListStackResources",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:GetResource"
      ],
      "Resource": "*"
    }
  ]
}
```

`sts:GetCallerIdentity` needs no permission. The AWS-managed `ReadOnlyAccess` or `ViewOnlyAccess` policies are enough. A denied call is reported with the action AWS named, never hidden.

## Data and privacy

- **Calls AWS:** STS `GetCallerIdentity` and the read calls listed above, from the commands you or the skill run. Never on its own.
- **Reads locally:** the `aws-context` snapshot, only to tell you when it names a different account than this run. Nothing else.
- **Stores:** nothing. Reports are printed, not cached. **Telemetry:** none.
- **Model context:** whatever you ask Claude to run is returned to the model, redacted as above. Treat a report as sensitive: it contains your account id, principal, and resource names.

## Limitations

- Redaction is best effort (see above).
- It reads what your credentials can read, in the region you give it. Cross-account and cross-region views are out of scope.
- It identifies and lists; it does not draw a diagram, diff templates, or judge whether a configuration is safe.
- No interactive panel yet. A panel that reads a local cache of these reports is planned.
- Real-session behavior on Windows and Linux is covered by CI against fake endpoints only.

## Verify it by hand

1. `pnpm build`, then `claude --plugin-dir plugins/aws-explorer`.
2. `/aws-explorer:explore list my stacks` shows the account and region of your active credentials, then the stacks.
3. Pick one: `/aws-explorer:explore why did <stack> fail?` reads its events.
4. With an account that lacks a permission, the report names the missing action.
5. `/plugin disable aws-explorer@claude-code-aws`: Claude Code is otherwise unchanged.
