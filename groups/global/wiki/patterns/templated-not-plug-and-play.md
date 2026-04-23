---
type: pattern
last-updated: 2026-04-23
sources:
  - aid-coo/wiki/findings/govai-rag-template-scope.md  (promoted 2026-04-23)
---

# "Templated, Not Plug-and-Play" — Product Framing for Variable Customer Infra

## Pattern

When delivering a productised solution (RAG template, agent template, integration template) into customers whose underlying infrastructure **varies significantly customer-to-customer**, the delivery team must front-load expectations with a **"templated, not plug-and-play"** framing.

Promising plug-and-play creates a long support tail: *"it didn't work with our setup"*. Setting the expectation correctly up front — that the template gives customers autonomy to deploy, but some per-customer configuration is expected — keeps customer satisfaction aligned with what the product can actually do.

This is a **product-messaging requirement**, not just an engineering concern. Framing it late costs trust.

## Why it matters

- **Customer infra variance is the default, not the exception** — SharePoint implementations vary dramatically across organisations, corporate data lakes have different schemas, identity stacks differ, permission models differ
- **Support economics** — every false plug-and-play expectation generates a ticket that is actually configuration work, which the customer expected to be free
- **Template adoption depends on honest framing** — customers who go in knowing they need to configure are more likely to adopt successfully than customers promised zero-effort install

## Structural conditions

- Product is a **template**, not a fully-bespoke build per customer
- Customer infrastructure varies enough that "just install" is genuinely false
- Customer will do the configuration themselves (or with the delivery team's help), not have the template fully customised by the supplier
- Engagement is pre-deployment enough that expectations can still be set

## How to apply

1. **Lead with the framing** in positioning material, demo scripts, and kickoff decks — before anyone says "plug-and-play"
2. **Show configuration surface** — explicitly name the 3–5 places customers will need to configure (knowledge-base connection, permission scope, taxonomy, branding, etc.)
3. **Reference validated cases** — "Customer X went live after N days of configuration following this template" beats any feature list
4. **Separate template scope from whole-of-org scope** — be clear about what the template *does* cover and what it doesn't; prevent scope creep into whole-of-org capabilities that belong to a different product line
5. **Park future iterations explicitly** — if customers ask about features not in the first iteration, park them as pipeline rather than let them contaminate the first-iteration scope

## When *not* to use

- Product genuinely is plug-and-play (rare, but happens for narrow-scope SaaS integrations)
- Customer infrastructure is standardised enough (e.g. a SaaS-only customer) that "install and go" is accurate
- Template is so customer-specific that it's really a bespoke build with marketing — framing it as "templated" sets up a different kind of disappointment

## Validation signal

A prior customer's deployment of an equivalent template required **significant up-front cleanup**, after which the customer was producing further bots / outputs from the same template autonomously. This is the shape of a healthy templated deployment: non-trivial setup, self-serve afterwards.

## Confidence

High on the framing requirement (the pattern has recurred across template-style engagements). Medium on the exact boundary — the line between "templated" and "requires customisation" is genuinely fuzzy and is context-dependent.

## Related

- [Agent Tool-Composition Positioning](../frameworks/agent-tool-composition-positioning.md) — adjacent framing for agent delivery
