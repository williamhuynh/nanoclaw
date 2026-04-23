---
type: meeting
last-updated: 2026-04-23
source: meeting transcript 15c15a6e — GovAI codesign session, RAG app + model comparison toolkit
---

# GovAI Codesign — RAG Application & Model Comparison Toolkit (23 Apr 2026)

## Attendees (inferred from transcript)
- Facilitator (Speaker 0) — session lead, AiD side
- Will Huynh (Speaker 1, inferred) — strategic framing voice; raised the "templated, not plug-and-play" constraint
- Lacey (Speaker 2) — DoF lead on the RAG application decision; had prior scope conversation with Beth
- DoF stakeholder (Speaker 3) — raised the pattern-vs-template question
- Sandy — time-pressured, running an internal launch in parallel
- Beth — referenced as scope-owner on whole-of-gov vs within-agency framing
- Mr Moore and Anthony Hunt — referenced as having many ministerial RAG use cases (not targeted in this iteration)

## Purpose
Codesign session to define the next two workstreams under GovAI:
1. RAG application template
2. Model comparison toolkit

Objective was to reduce the option space on RAG ("too many choices if we try internally") and align on a concrete first iteration.

## Key discussion

### RAG application — agreed direction
- Unique value vs GovAI chat: a **template** agencies deploy in their own environment.
- Default knowledge base: **SharePoint** ("basically everyone has it").
- Built to technical standards so it is reusable across agencies.
- **First iteration = generic policy bot.**
- Builds on the procurement app work already done at Dept (significant cleanup effort, but "has really taken off" — Dept is now producing additional policy bots off the same template).
- Subsequent iterations could tackle **public consultation analysis** or **post-tender analysis** (parked for later).
- Minister-facing use cases (Mr Moore, Anthony Hunt) have many RAG opportunities but no clear single winner — not the first target.

### Scope decision — within-agency vs whole-of-government
- Lacey confirmed (via Beth): **GovAI chat = whole-of-government capability**; **this RAG template = within-agency capability**.
- Speaker 3 surfaced the distinction; group agreed.

### Key constraint (Will)
- SharePoint variance across agencies means plug-and-play is not achievable.
- Framing to customers must be: *templated → agency autonomy on deployment → expect configuration work per agency*.
- Risk if mis-framed: "a dozen people messaging us going, it didn't work with our SharePoint".

### Model comparison toolkit
- Flagged for discussion in the same session but effectively parked because Sandy was constrained by a parallel internal launch.
- Agreed: internal alignment before external engagement on this one.

## Decisions made
1. Proceed with **RAG application template** as the next workstream.
2. First iteration = **generic policy bot**, leveraging Dept procurement app learnings.
3. Scope = **within-agency** (not whole-of-government — GovAI chat owns that).
4. Default knowledge base integration = **SharePoint**, with explicit "templated, not plug-and-play" framing.
5. Model comparison toolkit to progress on an **internal-alignment-first** basis before external engagement.

## Action items
- (Implied, owner TBC) Draft customer-facing framing for the RAG template making the "not plug-and-play" boundary explicit — before first agency rollout.
- (Implied, Lacey / Sandy) Run internal alignment session on the model comparison toolkit before bringing external stakeholders in.
- (AiD) Carry the within-agency vs whole-of-government distinction into any positioning material for the RAG template.

## Parked / future iterations
- Public consultation analysis use case
- Post-tender analysis use case
- Ministerial RAG use cases (Mr Moore, Anthony Hunt) — many opportunities, no clear single winner
