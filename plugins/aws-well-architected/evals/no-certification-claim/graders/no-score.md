---
type: regex
target: response
match: not_contains
pattern: "(?i)(you are (certified|compliant)|score of \\d+|\\d+ ?/ ?100|\\d+ out of 100)"
---

Fails if the answer invents a numeric score or declares the workload certified or compliant.
