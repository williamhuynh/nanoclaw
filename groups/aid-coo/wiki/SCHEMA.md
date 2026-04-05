# Wiki Schema — AiD Operations

*Maintained by AiD COO agent. Operational knowledge for AI Decisions.*

---

## Purpose

This wiki captures operational knowledge for AiD:
- Client engagements and pipeline
- Business decisions and their rationale
- Meeting notes and action items
- Team members, stakeholders, and their context
- Findings and observations from consulting work

This wiki does **not** contain:
- Will's personal preferences or behavioral patterns (that's ToME)
- Cross-project reusable frameworks (promote those to the global wiki)
- Raw source documents (those stay where they originate)

---

## Page Types

### Meeting (`meetings/`)
Structured extractions from meetings, calls, and conversations.
- **Immutable** — once written, don't modify. Add corrections as an addendum at the bottom.
- File naming: `YYYY-MM-DD-{topic-slug}.md`
- Include: date, attendees, key discussion points, decisions made, action items

### Entity (`entities/`)
People, organisations, systems, or concepts that recur across the business.
- **Evolving** — update as knowledge grows
- One file per entity
- Include: who/what, relationship to AiD, key context, last interaction

### Finding (`findings/`)
Observations, analysis results, research summaries.
- **Evolving** — update with new evidence
- Include: the finding, evidence/source, implications, confidence level

### Decision (`decisions/`)
Choices made with their rationale.
- **Append-only** — never edit a past decision, add new entries for reversals
- Include: date, decision, rationale, alternatives considered, outcome (if known)

---

## Promotion to Global Wiki

If a finding or pattern is reusable beyond AiD (e.g., a governance methodology that works across clients), tag it in log.md:

```
[YYYY-MM-DD HH:MM] #promote: {page path} — {one-line reason this is reusable}
```

Sky reviews and anonymises it for the global wiki. This agent does not write to the global wiki directly.

---

## Index Format

One line per page:
```
- [Page Title](relative/path.md) — one-line summary — last updated YYYY-MM-DD
```

---

## Ingest Rules

- Max 10 page operations per `/wiki-ingest` invocation
- Always check index.md before creating a new page — merge if a similar page exists
- Append to log.md after every operation
- For meeting pages: extract action items and flag them in the log
