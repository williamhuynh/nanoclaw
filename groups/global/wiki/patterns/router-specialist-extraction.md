---
type: pattern
last-updated: 2026-04-23
sources:
  - aid-coo/wiki/findings/coc-extraction-agent-architecture.md  (promoted 2026-04-23)
---

# Router + Specialist Extraction (vs. Single Generic Extractor)

## Pattern

For document-understanding pipelines at volume across **heterogeneous source formats**, a single generic LLM extractor consistently underperforms a **router + specialist** architecture:

```
Document → Format classifier (router) → Format-specific specialist extractor → Structured output
```

Specialist extractors tuned per source format hit acceptable accuracy on their target format; the same LLM asked to extract across all formats materially underperforms — often badly enough to kill a project.

## Observed evidence

- A regulator prospect ran this experiment at scale over ~8,000 documents/year across ~10–12 underlying source organisations and 6+ major intermediaries
- Format-specific agents: acceptable accuracy within their target format
- A single generic agent across all formats: poor accuracy; the project was scored as a failure
- Consistent with general document-AI industry experience — specialist-over-generalist is the default for structured extraction at volume

## When to apply

- Document intake spans multiple distinct formats (different source systems, different issuers, different templates) that do not share a common schema
- Volume is high enough to amortise the cost of maintaining multiple specialists
- Accuracy failures have downstream liability or regulatory consequences
- Workflow is regulated / auditable — human-in-the-loop escalation already expected

## When *not* to apply

- Documents are effectively single-format with minor variation — a single tuned extractor is cheaper
- Volume is low enough that human review is competitive with automation
- Source formats are self-describing (good structured headers, reliable semantic markup) — generic extraction is fine

## Architectural guidance

1. **Classifier first** — cheap, fast format detector. Wrong routing is the most expensive failure mode, so the classifier deserves more tuning attention than feels natural
2. **Per-format specialists** — schema-guided extraction, layout-aware where relevant. Expect each specialist to be a small project's worth of effort
3. **Hybrid fallback** — generic semantic extraction for *stable fields* that are format-invariant (e.g. insured entity, period of cover, sum insured on a certificate of currency) plus format-specific overrides for edge cases
4. **Confidence scoring + human escalation** — accuracy failures must surface; never ship raw extraction for regulated workflows without a confidence-gated review path
5. **Maintenance drag is real** — source formats change without notice. Either budget for ongoing per-format maintenance, or invest in a self-updating extraction layer (few-shot adaptation, prompt-from-schema, layout-aware models)

## Governance implication

For regulator / regulated-member workflows, this pattern is **governance-adjacent**: wrong extractions have liability consequences for the regulator's members. Any delivery must include confidence scoring, sampling / QA loops, and a human-in-the-loop escalation path — not just raw extraction accuracy metrics.

## Confidence

Medium-high — one observed prospect anecdote at scale, but consistent with general document-AI experience and the industry-standard pattern of specialist-over-generalist for structured extraction at volume.
