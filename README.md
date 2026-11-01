<p align="center">
  <img src="assets/readme-logo.png" alt="Claude Code for AWS" width="900">
</p>

<p align="center">
  <a href="https://github.com/Alejo2075/claude-code-aws/actions/workflows/ci.yml"><img src="https://github.com/Alejo2075/claude-code-aws/actions/workflows/ci.yml/badge.svg?style=flat-square&amp;labelColor=2D2B28" alt="CI"></a>
  <a href="https://github.com/Alejo2075/claude-code-aws/actions/workflows/codeql.yml"><img src="https://github.com/Alejo2075/claude-code-aws/actions/workflows/codeql.yml/badge.svg?style=flat-square&amp;labelColor=2D2B28" alt="CodeQL"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-CC785C.svg?style=flat-square&amp;labelColor=2D2B28" alt="MIT license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-CC785C.svg?style=flat-square&amp;labelColor=2D2B28" alt="Contributions welcome"></a>
</p>

<p align="center">Claude Code plugins for the full serverless application lifecycle on AWS.</p>

Build, test, review, deploy, and operate AWS serverless applications from Claude Code with focused, independently installable plugins. The plugins cover application code and infrastructure, event integrations, data services, security, testing, delivery, and production operations.

## Plugin catalog

The catalog below describes the plugins currently in this repository. Each plugin is developed as a separate capability, so you can install only what your workflow needs.

### 1. Core & Experience · 4 plugins

Account context, Claude Code interface, safety guardrails, and AWS resource exploration.

| Plugin                                                | What it helps with                                           |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| [aws-context](plugins/core-experience/aws-context/)   | AWS accounts, profiles, regions, and verified credentials.   |
| [aws-ui](plugins/core-experience/aws-ui/)             | Claude Code interface, prompt footer, mods, and visualizers. |
| [aws-guard](plugins/core-experience/aws-guard/)       | Approval prompts for potentially dangerous AWS operations.   |
| [aws-explorer](plugins/core-experience/aws-explorer/) | Read-only exploration of AWS resources and stack state.      |

### 2. Design · 5 plugins

Architecture, infrastructure design, diagrams, prototypes, and AWS best-practice reviews.

| Plugin                                                       | What it helps with                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| [aws-architect](plugins/design/aws-architect/)               | Architecture design, technical decisions, reviews, and ADRs.   |
| [aws-infrastructure](plugins/design/aws-infrastructure/)     | Serverless infrastructure development with CDK and TypeScript. |
| [aws-diagrams](plugins/design/aws-diagrams/)                 | Architecture, resource, and event-flow diagrams.               |
| [aws-prototyping](plugins/design/aws-prototyping/)           | Functional prototypes and bounded proof-of-concepts.           |
| [aws-well-architected](plugins/design/aws-well-architected/) | Reviews across the six AWS Well-Architected pillars.           |

### 3. Development · 14 plugins

Service-focused plugins for building serverless application components.

| Subcategory   | Plugin                                                            | Services                                             |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Compute       | [aws-lambda](plugins/development/compute/aws-lambda/)             | AWS Lambda                                           |
| Compute       | [aws-containers](plugins/development/compute/aws-containers/)     | ECS, Fargate, ECR                                    |
| APIs          | [aws-api](plugins/development/apis/aws-api/)                      | API Gateway; AppSync support is a planned extension. |
| Identity      | [aws-auth](plugins/development/identity/aws-auth/)                | Amazon Cognito                                       |
| Events        | [aws-events](plugins/development/events/aws-events/)              | EventBridge, Scheduler                               |
| Messaging     | [aws-messaging](plugins/development/messaging/aws-messaging/)     | SQS, SNS                                             |
| Orchestration | [aws-workflows](plugins/development/orchestration/aws-workflows/) | Step Functions                                       |
| Streaming     | [aws-streaming](plugins/development/streaming/aws-streaming/)     | Kinesis Data Streams, Data Firehose                  |
| Databases     | [aws-database](plugins/development/databases/aws-database/)       | DynamoDB, Aurora Serverless                          |
| Storage       | [aws-storage](plugins/development/storage/aws-storage/)           | S3, EFS                                              |
| Edge          | [aws-edge](plugins/development/edge/aws-edge/)                    | CloudFront, Lambda@Edge                              |
| AI            | [aws-ai](plugins/development/ai/aws-ai/)                          | Amazon Bedrock; AgentCore coverage is planned.       |
| Communication | [aws-email](plugins/development/communication/aws-email/)         | Amazon SES                                           |
| Configuration | [aws-config](plugins/development/configuration/aws-config/)       | AppConfig, Parameter Store                           |

### 4. Quality & Operations · 5 plugins

Security, testing, delivery, cost, and production operations.

| Plugin                                                             | What it helps with                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| [aws-security](plugins/quality-operations/aws-security/)           | IAM, security audits, and protection reviews.              |
| [aws-testing](plugins/quality-operations/aws-testing/)             | Unit and integration tests and validation workflows.       |
| [aws-deploy](plugins/quality-operations/aws-deploy/)               | CDK deployments, pipelines, and recovery workflows.        |
| [aws-cost](plugins/quality-operations/aws-cost/)                   | Cost estimates and optimization analysis.                  |
| [aws-observability](plugins/quality-operations/aws-observability/) | Logs, metrics, traces, alarms, and incident investigation. |

## Availability

The repository contains the complete plugin catalog above. The marketplace currently publishes **[aws-context](plugins/core-experience/aws-context/) and [aws-ui](plugins/core-experience/aws-ui/)**. The other plugins are in the repository while they are developed and validated; their presence here does not mean they are available to install from the marketplace yet.

When a plugin is published, add the marketplace in Claude Code and install that plugin:

```text
/plugin marketplace add Alejo2075/claude-code-aws
/plugin install <plugin>@claude-code-aws
```

## Design principles

- **Modular:** install plugins independently and keep each capability focused.
- **Read-only by default:** inspection, planning, and review do not change AWS resources.
- **Evidence first:** separate verified AWS state, local definitions, estimates, inferences, and unknowns.
- **User controlled:** use your existing AWS credentials; cloud mutations require explicit authorization.
- **AWS-side controls matter:** local checks add safeguards but do not replace IAM, permission boundaries, or organization policies.

## Develop locally

This is a pnpm and TypeScript monorepo. Use Node.js 22 or later and pnpm 10.34.8.

```sh
corepack enable
pnpm install
pnpm verify
```

`pnpm verify` runs the repository's formatting, lint, type, test, marketplace, packaging, and release-flow checks. See [CONTRIBUTING.md](CONTRIBUTING.md) to propose or develop a plugin, [plugin authoring](docs/plugin-authoring.md) for component conventions, and the [release runbook](docs/release.md) for publication requirements.

## Project documentation

- [Roadmap](docs/ROADMAP.md)
- [Development plan](docs/DEVELOPMENT_PLAN.md)
- [Security model](docs/security-model.md)
- [Installation guide](docs/install.md)
- [Plugin authoring](docs/plugin-authoring.md)
- [Release runbook](docs/release.md)

The project is licensed under [MIT](LICENSE). Product and engineering requirements are maintained in [CLAUDE.md](CLAUDE.md).
