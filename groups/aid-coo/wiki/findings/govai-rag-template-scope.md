---
type: finding
last-updated: 2026-04-23
source: GovAI codesign session 23 Apr 2026
---

# GovAI RAG Template — Scope, Scaffolding and Constraints

## Finding
The GovAI RAG application is scoped as a **within-agency templated application**, distinct from GovAI chat which owns the whole-of-government layer. First iteration is a generic policy bot, building on the Dept procurement app learnings. The critical framing constraint is that SharePoint variance across agencies makes true plug-and-play unachievable — the product story must set "templated with configuration" expectations up front.

## Key points

### Scope boundary (Beth → Lacey)
- **GovAI chat** = whole-of-government capability (horizontal).
- **GovAI RAG template** = within-agency capability (vertical, per-agency deployment).
- Any positioning, naming or rollout material must preserve this boundary.

### Architectural shape
- Template pattern, not bespoke build per agency.
- Default knowledge base = SharePoint (highest agency coverage).
- First iteration = generic policy bot (validated template shape from Dept procurement app reuse).
- Future iterations parked: public consultation analysis, post-tender analysis, ministerial-facing RAG.

### Framing constraint — "templated, not plug-and-play"
- SharePoint implementations vary significantly agency to agency.
- Promising plug-and-play creates a support tail ("it didn't work with our SharePoint").
- Customer message must be: template gives autonomy in deployment; some per-agency configuration is expected.
- This is a product-messaging requirement, not just an engineering one.

### Validation signal
- Dept procurement app: significant cleanup required up front, now "really taken off" with Dept producing further policy bots from the same template. Validates the template approach at an in-agency level.

## Implications for AiD
- Positioning material for GovAI RAG must lead with the within-agency frame and the templated-with-config expectation.
- Ministerial use cases (Mr Moore / Anthony Hunt) have appetite but no clear primary target — park these as pipeline, not first-iteration.
- Model comparison toolkit is on an **internal-alignment-first** track; avoid pulling external stakeholders in prematurely.

## Confidence
High on scope and first-iteration choice (agreed in session). Medium on future iteration order (parked but not formally prioritised).

## #promote candidate?
Partial — the "templated, not plug-and-play" framing pattern is reusable to any AiD engagement where agency/customer infra variance is high; promote the framing pattern, not the GovAI-specific scope.
