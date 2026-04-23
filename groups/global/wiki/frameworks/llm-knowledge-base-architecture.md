---
type: framework
last-updated: 2026-04-23
sources:
  - aid-coo/wiki/findings/westpac-research-corpus-framework.md  (promoted 2026-04-23)
---

# LLM Knowledge Base Architecture (Karpathy-style)

## Purpose

A durable, agent-ready knowledge base built from raw source material. Knowledge compounds at *ingest time* — not query time — so downstream agents and humans can read, cite, and act on structured synthesis instead of running repeated RAG lookups over raw documents.

Useful whenever an engagement delivers a *corpus of understanding* (customer research, regulatory review, technical analysis) that must outlive a single report and feed downstream agents or simulators.

## The three-layer architecture

### Layer 1 — Raw Sources (immutable)

Original source material: interview transcripts, survey responses, behavioural observation notes, session recordings, primary documents. Source of truth. The LLM reads but never modifies this layer.

### Layer 2 — Compiled Wiki (LLM-maintained)

Structured knowledge pages compiled from raw sources:
- **Entity pages** — personas, segments, organisations, products, themes
- **Finding pages** — synthesised insights connecting multiple data points
- **Connection pages** — links between themes discovered at ingest time
- **Index and metadata** — tags, cross-references, confidence levels, citations, segment applicability

### Layer 3 — Schema (human-authored)

Design rules for output structure: page types, metadata requirements, taxonomies, mutability rules. The consultancy's core intellectual contribution — the schema determines what the wiki *can* become.

## Four curation operations

1. **Ingest** — each new artefact compiled into multi-page wiki updates, with citations back to Layer 1
2. **Synthesis** — periodic cross-corpus analysis generating higher-order insights
3. **Lint** — health checks finding contradictions, gaps, stale claims, new questions
4. **Query** — agent or human questions answered with citations; valuable answers are promoted to pages

## Why not plain RAG

- Knowledge compounds at ingest time, not query time
- Connections are found proactively, not reactively on each question
- Human-readable and auditable (no black-box embeddings)
- Structured for downstream agent use cases (simulators, decision support, reporting)

## When to use

- Long-lived corpora (customer research libraries, regulatory knowledge bases, post-incident learnings)
- Engagements where the client will keep extending the corpus after delivery
- Cases where auditability and citation provenance matter

## When *not* to use

- One-off document QA with no reuse of the corpus
- Small corpora where embedding-based RAG is cheaper to stand up and good enough
- Situations with no human or agent-readable Layer 3 schema discipline — the whole approach depends on it

## Positioning language

> "We apply the LLM Knowledge Base architecture — recently validated by Andrej Karpathy at scale — to [domain]. Instead of delivering a static report, we deliver a living, agent-ready knowledge corpus that compounds with every new input."

## References

- Karpathy X post (3 Apr 2026): https://x.com/karpathy/status/2039805659525644595
- Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- AiD internal implementation: the `wiki-ingest` / `wiki-query` skill pair used by nanoclaw project agents is a working example of this architecture

## Deliverable shape (indicative)

1. **Schema design** — output structure, page types, metadata, taxonomies
2. **Compilation pipeline** — SOPs + agent that operationalises ingest and synthesis
3. **Prototype / value-add** — domain-specific demonstrator (e.g. persona simulator, policy bot) showing the corpus being exercised
