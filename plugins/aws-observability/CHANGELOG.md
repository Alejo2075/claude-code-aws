# aws-observability

## 0.1.0

### Minor Changes

- [#24](https://github.com/Alejo2075/claude-code-aws/pull/24) [`dc0ff92`](https://github.com/Alejo2075/claude-code-aws/commit/dc0ff92c6a7acb0579597921104c2925ca19cc86) Thanks [@Alejo2075](https://github.com/Alejo2075)! - First release: read-only status of Lambda functions and SQS queues (including dead-letter queue depth), bounded and redacted log samples, standard metrics as time series, an alarm inventory, and an `investigate` command that builds an evidence ledger and reports timeouts, memory exhaustion, throttling, error rates, and cold starts as findings that cite it. Includes an `incident-investigator` agent with evals for read-only discipline and for refusing to name a root cause without evidence. It changes nothing in AWS.
