---
type: meeting
last-updated: 2026-04-23
source: meeting transcript — discovery call with accounting regulator (likely CA ANZ) re. Certificate of Currency reader agent
---

# CA ANZ — Certificate of Currency Reader Agent Discovery (23 Apr 2026)

## Attendees
- Anthony — senior stakeholder, regulator (Speaker 0)
- "Anu" — compliance team member, regulator (Speaker 1); runs member compliance operations
- Will (AiD) — presumed present; no direct quotes captured in transcript window

> Entity inferred to be CA ANZ (Chartered Accountants Australia & New Zealand) based on: "Certificate of Public Practice" terminology, 120 hrs / 3 yrs / 90 verifiable CPD rule, Australian professional standards legislation framing. Could also be CPA Australia or IPA — confirm with Will.

## Context — the regulator
- Regulator + advocate body for chartered accountants in Australia
- Runs education → Certificate of Public Practice (CPP) enabling members to open their own firm
- Runs CPD compliance: 120 hours every 3 years, 90 verifiable
- Provides ethics advice line to members
- Government advocacy: capital gains tax benefits debate, AML regime hitting accountants/lawyers/real estate agents from **1 July 2026**
- Members operate under Australian professional standards legislation — capped liability tied to appropriate PI insurance

## The compliance workflow (Anu's team)
- Members with a CPP must complete a mandatory annual compliance questionnaire
- Questionnaire captures: number of partners, revenue, insurance status, highest engagement fee bracket
- Members must submit a **Certificate of Currency (CoC)** proving PI insurance in force
- PI premiums are 12-month policies; renewed annually
- Volume: **~8,000 CoCs per year** (confirmed by Anu)

## The problem
- Australian PI insurance is sold through ~10–12 insurers and 6+ major brokers (Aon, Gallagher, Marsh, etc.)
- Every broker issues CoCs on their own letterhead / format (scan, PDF, faxed form)
- CoCs contain: insured entity name, sum insured, period of cover
- Today: humans manually read CoCs and cross-check against the questionnaire

## Prior project (last year)
- Built an AI agent to read CoCs — ambition was **one generic agent** across all broker formats
- Result: broker-specific agents performed well; the generic agent performed poorly
- Scored the project as a **fail** because broker-agnostic was a core goal
- Concern raised: broker-specific agents are costly to maintain as insurers change fonts/formats without notice

## Current scope of intent
Want an agent that:
1. Reads the CoC regardless of broker
2. Compares CoC data against the member's self-reported questionnaire
3. Three-layer check:
   - (a) Highest engagement fee bracket match
   - (b) Compare against dictionary / expected premium bracket
   - (c) Third comparison layer (detail not captured in transcript)

## Open questions
- Is a truly generic model viable, or must the pipeline segment per broker (with a router / format classifier up front)?
- Anthony reflected: *"maybe we need to modify some of [the approach] … it's not open-ended as that"* — signals openness to a hybrid architecture rather than forcing one model

## Decisions
- None captured in this window. Discovery-stage conversation.

## Action items
- (Implied) AiD to follow up with a proposed approach — Will's side
- Confirm exact regulator identity (CA ANZ vs CPA Australia vs IPA) and named stakeholders with Will before the wiki entity is treated as authoritative
