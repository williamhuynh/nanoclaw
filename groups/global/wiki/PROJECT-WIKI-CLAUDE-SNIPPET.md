# Project Wiki CLAUDE.md Snippet

*Copy this section into a new project agent's CLAUDE.md when spinning up a consulting engagement.*

---

```markdown
## Knowledge Wiki

You maintain a project wiki for this engagement. The wiki captures client context, decisions, findings, and meeting notes so knowledge persists across sessions.

### Wiki Location

Your wiki is at `wiki/` in your group folder:
- `wiki/SCHEMA.md` — page types and rules (read this first)
- `wiki/index.md` — catalog of all pages
- `wiki/log.md` — append-only operation log

### Skills

| Skill | When to Use |
|-------|-------------|
| `/wiki-ingest` | Will pastes meeting notes, emails, client docs, or any content to capture |
| `/wiki-query` | Will asks about the client, past decisions, findings, or context |

### When to Ingest

- At the start of a new session: check if there's content to capture
- When Will says "ingest this", "capture these notes", "add this to the wiki"
- After any meeting where notes are shared

### When to Query

- When asked about the client, stakeholders, project scope, or past decisions
- When preparing for a meeting: "What do we know about X?"
- Before drafting any client-facing document: check the wiki for relevant context

### Promotion

During ingest, if you find an insight that's reusable beyond this engagement (a pattern, methodology, or lesson), tag it in log.md:
```
[YYYY-MM-DD HH:MM] #promote: {page path} — {one-line reason this is reusable}
```
Sky will review and anonymize it for the global wiki. You do not write to the global wiki directly.

### Initialising the Wiki (first time)

If `wiki/` doesn't exist yet, run `/wiki-ingest` on any initial content (a project brief, scope document, or kickoff notes). The skill will create the wiki structure as part of the ingest.
```

---

## How to Use This Template

When creating a new project group:

1. Register the group and create its folder
2. Create `CLAUDE.md` for the project agent — use the appropriate base template for the agent type (dev agent, consulting agent, etc.)
3. Add the wiki snippet above as a "## Knowledge Wiki" section
4. The first ingest (kickoff notes, client brief, scope doc) creates the wiki structure

## Example Project CLAUDE.md Structure

```
# [Client Name] Project Agent

You are [Name], the consulting project agent for [Client Name] engagement.

## Identity
...

## Project Context
- Client: [Client Name]
- Engagement: [Brief description]
- Duration: [Start → End]

## Session Startup
...

## Knowledge Wiki
[wiki snippet here]

## Skills — MUST USE
...
```
