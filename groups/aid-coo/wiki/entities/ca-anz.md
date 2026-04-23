---
type: entity
last-updated: 2026-04-23
source: discovery call 23 Apr 2026
---

# CA ANZ (Chartered Accountants Australia & New Zealand)

> **Identity confidence: medium.** Inferred from terminology (Certificate of Public Practice, 120/90 CPD rule, Australian professional standards legislation). Could also be CPA Australia or IPA — confirm with Will before treating as authoritative.

## What they do
- Regulator and advocate body for chartered accountants in Australia
- Education pathway → Certificate of Public Practice (CPP)
- Enforces CPD: 120 hrs / 3 yrs, 90 verifiable
- Ethics advisory line for members
- Government advocacy (currently active on capital gains tax debate, AML regime going live 1 Jul 2026)

## Relationship to AiD
- **Status:** discovery / early scoping (as of 23 Apr 2026)
- **Opportunity:** rescoping a previously-failed AI agent for Certificate of Currency (CoC) extraction and compliance matching
- **Prior project:** built an agent last year; the generic model failed, broker-specific variants worked
- **Volume:** ~8,000 CoCs per year processed

## Stakeholders
- **Anthony** — senior stakeholder; owns the program / budget-facing. Strategic framing.
- **Anu** — compliance team lead; operational owner of the questionnaire and CoC check process

## Key context
- PI insurance market: ~10–12 insurers, 6+ major brokers (Aon, Gallagher, Marsh, etc.)
- Each broker has its own CoC format — source of the generalisation problem
- Three-layer compliance check: highest engagement fee match, premium bracket match, plus a third layer (detail TBC)
- Members operate under professional standards legislation — capped liability depends on holding appropriate PI insurance, so CoC compliance is not cosmetic

## Open items
- Confirm entity identity (CA ANZ vs CPA Australia vs IPA)
- Clarify third comparison layer
- Determine whether prior failed project was delivered by AiD or a third party

## Recent interactions
- **2026-04-23** — Discovery call on CoC agent ([meeting](../meetings/2026-04-23-ca-anz-coc-agent-discovery.md))
