---
type: finding
last-updated: 2026-04-13
source: Will's request for framework thinking on research-to-agent corpus approach, 13 Apr 2026
---

# Westpac Research Corpus Framework

## Finding
The Karpathy "LLM Knowledge Base" architecture (published 3 Apr 2026) maps directly to what Westpac needs for their research corpus — and AiD is already running a working implementation of it (the wiki-ingest system). This gives AiD a credible, proven approach to articulate in the proposal.

## The Three-Layer Architecture

### Layer 1 — Raw Sources (immutable)
Interview transcripts, survey responses, behavioural observation notes, session recordings. Source of truth. LLM reads but never modifies.

### Layer 2 — Compiled Wiki (LLM-maintained)
Structured knowledge pages compiled from raw sources:
- **Entity pages** — personas, segments, product concepts, themes
- **Finding pages** — synthesised insights connecting multiple data points
- **Connection pages** — links between themes discovered at ingest time
- **Index and metadata** — tags, cross-references, confidence levels, citations, segment applicability

### Layer 3 — Schema (human-authored)
Design rules for output structure: page types, metadata requirements, taxonomies. AiD's core contribution.

## Four Curation Operations

1. **Ingest** — Each research artefact compiled into multi-page wiki updates
2. **Synthesis** — Periodic cross-corpus analysis generating higher-order insights
3. **Lint** — Health checks finding contradictions, gaps, stale claims, new questions
4. **Query** — Agent or human questions answered with citations; valuable answers become pages

## Why Not RAG
- Knowledge compounds at ingest time, not query time
- Connections found proactively, not reactively
- Human-readable and auditable (no black-box embeddings)
- Structured for the human simulator downstream use case

## AiD Deliverables (Proposed)
1. **Schema Design** — output structure, page types, metadata, taxonomies
2. **Compilation Pipeline** — SOPs agent operationalising ingest and synthesis
3. **Persona Prototype** — value-add freebie demonstrating simulator capability

## Karpathy Positioning
"We're applying the LLM Knowledge Base architecture — recently validated by Andrej Karpathy at scale — to customer research. Instead of delivering a static report, we deliver a living, agent-ready knowledge corpus that compounds with every new research input."

## References
- Karpathy X post (3 Apr 2026): https://x.com/karpathy/status/2039805659525644595
- GitHub Gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## Related
- [Westpac entity page](../entities/westpac.md)
- [Westpac Human Simulator — Strategic Alignment](westpac-human-simulator.md)
