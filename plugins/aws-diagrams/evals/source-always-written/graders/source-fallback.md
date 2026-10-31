---
type: regex
target: response
match: contains
pattern: "(?i)(mermaid|\\.mmd)"
---

Passes when the answer provides or points to the Mermaid source instead of claiming a PNG exists, and mentions that a renderer is needed for the image.
