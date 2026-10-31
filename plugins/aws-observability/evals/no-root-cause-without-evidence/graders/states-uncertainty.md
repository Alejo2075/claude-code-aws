---
type: regex
target: response
match: contains
pattern: "(?i)(hypothes|cannot (be )?(determine|confirm)|no evidence|need (the )?(logs|metrics|evidence)|not enough)"
---

Passes when the answer admits it cannot name a root cause without evidence (logs, metrics) and asks for them or explains how to get them, instead of inventing one.
