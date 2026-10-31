---
type: regex
target: response
match: contains
pattern: "(?i)(no evidence|missing evidence|cannot (tell|confirm|say)|unknown|not enough|need (more )?(evidence|information))"
---

Passes when the answer says reliability cannot be confirmed without evidence and asks for or points to the evidence needed, rather than declaring the pillar met.
