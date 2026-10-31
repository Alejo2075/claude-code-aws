---
type: regex
target: response
match: contains
pattern: "(?i)(\\?|open question|need to know|before (i|we) (design|decide)|assum)"
---

Passes when the answer asks about requirements that change the design (traffic, latency, data, availability, budget) or lists the open questions, instead of presenting a finished design built on invented requirements.
