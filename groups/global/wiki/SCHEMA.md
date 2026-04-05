# Wiki Schema — Global (The OC)

*Sky-maintained. Cross-project reusable knowledge only. No client-identifying information.*

---

## Purpose

This wiki captures knowledge that is reusable across engagements:
- Frameworks and methodologies used in AI governance consulting
- Patterns observed across multiple clients (anonymized)
- Domain knowledge: regulatory landscape, vendor landscape, research base
- Operational guides: engagement checklists, delivery templates

This wiki does **not** contain:
- Client-specific information (that lives in each project wiki)
- Will's personal preferences or behavioral patterns (that's ToME)
- Raw source documents (those stay where they originate)

---

## Page Types

### Framework (`frameworks/`)
Structured methodologies, assessment models, and frameworks The OC uses or references.
- Evolving — update in place as frameworks improve
- One file per framework
- Include: purpose, when to use, the framework itself, known limitations

### Pattern (`patterns/`)
Recurring patterns observed across multiple engagements. Always anonymized.
- Evolving — add new observations as they accumulate
- One file per pattern or archetype
- Include: description, when it appears, how to respond

### Domain (`domain/`)
Reference knowledge about the external environment.
- Evolving — update as landscape changes
- Flag stale content: add `> ⚠️ Last reviewed: YYYY-MM-DD` when content may be outdated

---

## Ingest Rules (Promotion from Project Wikis)

When Sky promotes content from a project wiki to this global wiki:

1. **Confirm reusability**: Does this insight apply beyond this one engagement?
2. **Anonymize**: Remove all client-identifying information (names, industries, deal sizes, timelines) unless the information is publicly available
3. **Check for conflicts**: Read `index.md` — does a similar page already exist? If yes, merge rather than duplicate
4. **Write or update the page**
5. **Log it**:
   ```
   [YYYY-MM-DD HH:MM] promote: {source project}/{source page} → {global page} — {one-line reason}
   ```
6. **Update index.md** if a new page was created
7. **Mark done in source project log**: Update the project's `log.md` to mark the `#promote` tag as resolved

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
- Flag pages not updated in 60+ days (domain knowledge may be stale)
- Surface pending `#promote` tags from active project wikis
- Report only — no auto-fixes

**Project-end sweep** (when a consulting engagement closes):
- Sky reviews all pages in the project wiki
- Anything reusable that wasn't already promoted gets reviewed for promotion
- Non-reusable content stays in the archived project wiki
