---
name: wiki-ingest
description: Extract and store structured knowledge from content into the project wiki. Use when receiving meeting notes, emails, documents, or any content to capture.
---

# /wiki-ingest — Ingest Content into Wiki

Extract structured knowledge from the provided content and store it in the project wiki.

## Prerequisites

Check if the wiki exists:

```bash
test -d /workspace/group/wiki && echo "WIKI_EXISTS" || echo "NO_WIKI"
```

If `NO_WIKI`, respond:
> No wiki configured for this group. The wiki needs to be set up first.

Then stop.

If `WIKI_EXISTS`, read the schema first:

```bash
cat /workspace/group/wiki/SCHEMA.md
```

## Process

### 1. Read Current State

```bash
cat /workspace/group/wiki/index.md
```

This tells you what pages already exist so you can merge rather than duplicate.

### 2. Analyse the Input Content

Read the content provided (it may be in the prompt, a file path, or pasted text). Identify:

- **Meetings**: Date, attendees, discussion points, decisions, action items
- **Entities**: People, organisations, systems mentioned that are worth tracking
- **Findings**: Observations, analysis, research results
- **Decisions**: Choices made with rationale

### 3. Create or Update Pages

For each extraction:

1. Check if a relevant page already exists in the index
2. If yes: read the existing page, merge the new information in, following the page type's mutability rules (meetings are immutable — create a new page; entities and findings are evolving — update in place; decisions are append-only)
3. If no: create a new page following the schema's formatting rules

**File naming conventions:**
- Meetings: `wiki/meetings/YYYY-MM-DD-{topic-slug}.md`
- Entities: `wiki/entities/{name-slug}.md`
- Findings: `wiki/findings/{topic-slug}.md`
- Decisions: `wiki/decisions/YYYY-MM-DD-{decision-slug}.md`

Use lowercase, hyphens for slugs. No spaces in filenames.

### 4. Update Index

After creating or updating pages, update `wiki/index.md`:
- Add new pages under the correct section
- Format: `- [Page Title](relative/path.md) — one-line summary — last updated YYYY-MM-DD`

### 5. Update Log

Append to `wiki/log.md` for each operation:

```
[YYYY-MM-DD HH:MM] created: {path} — {one-line description}
[YYYY-MM-DD HH:MM] updated: {path} — {what was added/changed}
```

If you find something worth promoting to the global wiki, also log:
```
[YYYY-MM-DD HH:MM] #promote: {path} — {one-line reason this is reusable}
```

### 6. Limits

- Maximum 10 page operations per invocation
- If more are needed, log the remaining items:
  ```
  [YYYY-MM-DD HH:MM] deferred: {count} items pending — {brief description}
  ```
  These will be processed on the next invocation.

## Output

Summarise what was captured:
- Pages created (with paths)
- Pages updated (with what changed)
- Action items flagged
- Any items deferred

Keep the summary concise — the wiki itself is the detailed record.
