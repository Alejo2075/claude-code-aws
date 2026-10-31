---
"aws-observability": minor
---

First release: read-only status of Lambda functions and SQS queues (including dead-letter queue depth), bounded and redacted log samples, standard metrics as time series, an alarm inventory, and an `investigate` command that builds an evidence ledger and reports timeouts, memory exhaustion, throttling, error rates, and cold starts as findings that cite it. Includes an `incident-investigator` agent with evals for read-only discipline and for refusing to name a root cause without evidence. It changes nothing in AWS.
