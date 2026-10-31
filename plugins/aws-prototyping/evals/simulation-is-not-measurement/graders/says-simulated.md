---
type: regex
target: response
match: contains
pattern: "(?i)(simulat|model|not (a )?measure|assum)"
---

Passes when the answer says the figures come from a simulation of the stated model and are not a measurement or a prediction of production latency on AWS.
