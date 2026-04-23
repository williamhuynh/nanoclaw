---
type: finding
last-updated: 2026-04-23
source: CA ANZ discovery call 23 Apr 2026
---

# Certificate of Currency Extraction — Architectural Tension

## Finding
A single generic LLM agent reading Certificates of Currency across heterogeneous broker formats **underperforms** broker-specific agents. This is a real-world signal that document-understanding pipelines for regulated workflows may need a **router + specialist** architecture, not a one-model-to-rule-them-all approach.

## Evidence
- CA ANZ (prospect) ran this experiment at scale last year
- Broker-specific agents: acceptable accuracy on their target format
- Generic agent across all formats: poor accuracy — project scored as a fail
- Volume: ~8,000 documents/year, across ~10–12 insurers and 6+ major brokers

## Implications for AiD delivery
- For high-variance document pipelines, default to a **format classifier → specialist extractor** pattern rather than a single generic extractor
- Broker-specific specialists create maintenance drag (formats change without notice) — budget for this explicitly, or invest in a self-updating extraction layer (schema-guided extraction, layout-aware models, few-shot adaptation)
- A hybrid is likely the right shape: generic semantic extraction for stable fields (insured entity, period, sum insured) + format-specific overrides for edge cases
- This is a **governance-adjacent** problem: accuracy failures have liability consequences for the regulator's members, so any agent needs confidence scoring + human-in-the-loop escalation, not just raw extraction

## Confidence
Medium-high — single prospect anecdote, but consistent with general document-AI experience and aligns with industry pattern of specialist-over-generalist for structured extraction at volume.

## #promote candidate?
Yes — the router/specialist vs. generic pattern is a reusable architectural insight across clients dealing with high-variance document extraction (super funds, insurers, government).
