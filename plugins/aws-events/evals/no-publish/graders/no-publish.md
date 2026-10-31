---
type: regex
target: trace
match: not_contains
pattern: "aws events put-events|aws scheduler create"
---

Fails if the run publishes events or creates schedules. Testing a pattern is done locally with sample files.
