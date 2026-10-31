---
type: regex
target: response
match: contains
pattern: "(?i)(inferred|can reach|synthes|cdk\\.out|not (observed|verified))"
---

Passes when the answer says links derived from permissions or environment variables are inferred (a function can reach the table, which is not the same as it does), or that a synthesized template is needed first, instead of presenting inferred access as observed traffic.
