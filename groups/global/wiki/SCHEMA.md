# Wiki Schema — Global (Will Huynh / The OC)

*Sky-maintained. Cross-cutting knowledge shared across all agents.*

---

## Purpose

This wiki is the **shared knowledge base for all agents** in Will's system. It is not constrained to any one domain. Agents span consulting, development, social media, personal assistance, and more — this wiki captures knowledge useful across more than one agent or context.

**What belongs here:**
- Infrastructure and systems: how nanoclaw is set up, integrations, credentials architecture
- Agent registry: who each agent is, what they do, what they know
- Frameworks and methodologies: AI governance, delivery, consulting
- Patterns: recurring observations across clients or projects (anonymized)
- Domain knowledge: regulatory landscape, vendor landscape, research base
- Will's working context: professional roles, key accounts, tools in use

**What does NOT belong here:**
- Client-specific information (lives in each project wiki)
- Will's personal preferences and behavioral patterns (that's ToME)
- Raw source documents (stay where they originate)
- Sky-specific operational memory (lives in Sky's group wiki)

---

## Page Types

### Infrastructure (`infrastructure/`)
How Will's agent system is set up — integrations, credentials, architecture decisions, nanoclaw config.
- Evolving — update in place
- One file per system or integration
- Include: what it is, how it's configured, why decisions were made, credential locations (never the credentials themselves)

### Agents (`agents/`)
One page per agent — capabilities, access level, specialisation, how to delegate to it.
- Evolving — update as agents are added or change
- See also: `registry.md` for the routing index

### Framework (`frameworks/`)
Structured methodologies, assessment models, and frameworks The OC uses or references.
- Evolving — update in place as frameworks improve
- One file per framework
- Include: purpose, when to use, the framework itself, known limitations

### Pattern (`patterns/`)
Recurring patterns observed across multiple engagements or contexts. Always anonymized.
- Evolving — add new observations as they accumulate
- One file per pattern or archetype

### Domain (`domain/`)
Reference knowledge about the external environment.
- Evolving — update as landscape changes
- Flag stale content: add `> ⚠️ Last reviewed: YYYY-MM-DD` when content may be outdated

---

## Ingest Rules

When any agent ingests content into this wiki:

1. **Check scope**: Does this knowledge apply to more than one agent or context? If yes, it belongs here.
2. **Check index.md**: Does a matching page already exist? Update rather than duplicate.
3. **Anonymize** client-specific content before promoting from project wikis.
4. **Write or update the page** (max 10 page operations per ingest).
5. **Update index.md** if new pages were created.
6. **Update registry.md** if agent capabilities changed.
7. **Log the operation** in `log.md`.

---

## Index Format

One line per page:
```
- [Page Title](relative/path.md) — one-line summary — last updated YYYY-MM-DD
```

---

## Review Cadence

**Fortnightly lint** (Sky runs this, same session as ToME review):
- Check index integrity: all listed pages exist, no orphaned files
- Flag pages not updated in 60+ days (may be stale)
- Surface pending `#promote` tags from active project wikis
- Report only — no auto-fixes

**Project-end sweep** (when a consulting engagement closes):
- Sky reviews all pages in the project wiki
- Anything reusable that wasn't already promoted gets reviewed for promotion
- Non-reusable content stays in the archived project wiki
