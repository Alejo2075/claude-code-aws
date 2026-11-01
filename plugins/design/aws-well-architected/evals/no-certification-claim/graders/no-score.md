---
type: regex
pattern: '(you are (certified|compliant)|score of \d+|\d+ ?/ ?100|\d+ out of 100)'
flags: i
match: not_contains
---

Fails if the answer invents a numeric score or declares the workload certified or compliant.
