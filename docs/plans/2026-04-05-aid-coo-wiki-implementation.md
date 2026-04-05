# AiD COO Agent + Wiki Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a persistent AiD COO project agent with a wiki-based knowledge system, and build two shared container skills (wiki-ingest, wiki-query) that any project agent can use.

**Architecture:** The AiD COO is a registered group (`aid-coo@nanoclaw`) with its own folder, CLAUDE.md, and wiki/ directory. Two container skills in `container/skills/` provide wiki operations. Skills are auto-synced to all agents at container startup. Sky delegates AiD-related tasks via the existing delegation system.

**Tech Stack:** Markdown (SKILL.md files), bash (container skills are instruction-only, executed by the agent)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `groups/aid-coo/CLAUDE.md` | Create | Agent identity, wiki instructions, delegation response |
| `groups/aid-coo/wiki/SCHEMA.md` | Create | Project-level wiki schema (meetings, entities, findings, decisions) |
| `groups/aid-coo/wiki/index.md` | Create | Empty page catalog |
| `groups/aid-coo/wiki/log.md` | Create | Empty operation log |
| `container/skills/wiki-ingest/SKILL.md` | Create | Ingest skill — extract and store structured knowledge |
| `container/skills/wiki-query/SKILL.md` | Create | Query skill — search and synthesise from wiki |
| `groups/main/CLAUDE.md` | Modify | Add AiD COO to delegation awareness |

---

### Task 1: Register AiD COO Agent

**Files:**
- No code files — uses existing DB and IPC mechanisms

This task registers the agent group in the database so NanoClaw recognises it.

- [ ] **Step 1: Find the main group JID for the notify field**

```bash
sqlite3 /home/nanoclaw/nanoclaw/store/messages.db "SELECT jid FROM registered_groups WHERE json_extract(data, '$.isMain') = 1 LIMIT 1;"
```

Note the JID — it goes into the CLAUDE.md in Task 2.

- [ ] **Step 2: Register the group in the database**

```bash
sqlite3 /home/nanoclaw/nanoclaw/store/messages.db "
INSERT OR REPLACE INTO registered_groups (jid, data) VALUES (
  'aid-coo@nanoclaw',
  json('{
    \"name\": \"AiD COO\",
    \"folder\": \"aid-coo\",
    \"trigger\": \"@Sky\",
    \"added_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"requiresTrigger\": false
  }')
);"
```

- [ ] **Step 3: Create the group folder structure**

```bash
mkdir -p /home/nanoclaw/nanoclaw/groups/aid-coo/{wiki/{meetings,entities,findings,decisions},logs,conversations}
```

- [ ] **Step 4: Verify registration**

```bash
sqlite3 /home/nanoclaw/nanoclaw/store/messages.db "SELECT jid, data FROM registered_groups WHERE jid = 'aid-coo@nanoclaw';"
```

Expected: one row with the registered group data.

- [ ] **Step 5: Restart NanoClaw to load the new group into memory**

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)" && systemctl --user restart nanoclaw
```

- [ ] **Step 6: Verify the agent appears in available_agents**

Wait 5 seconds, then:

```bash
cat /home/nanoclaw/nanoclaw/data/ipc/main/available_agents.json
```

Expected: `aid-coo` should appear in the agents list (it has no `worker:` prefix but the list includes all registered non-main groups — verify this. If it only includes `worker:` prefixed groups, this needs a code change in `src/index.ts` where `available_agents.json` is written).

- [ ] **Step 7: Commit**

```bash
git add groups/aid-coo/
git commit -m "feat: register AiD COO project agent with wiki folder structure"
```

---

### Task 2: Write AiD COO CLAUDE.md

**Files:**
- Create: `groups/aid-coo/CLAUDE.md`

The CLAUDE.md defines the agent's identity and behavior. Use the LinkedIn agent (`groups/linkedin-agent/CLAUDE.md`) as a style reference for specialist agents, and the global template (`groups/global/CLAUDE.md`) for shared sections.

- [ ] **Step 1: Write CLAUDE.md**

Create `groups/aid-coo/CLAUDE.md`:

```markdown
# AiD COO

You are the virtual Chief Operating Officer of AI Decisions (AiD), Will Huynh's AI governance consulting practice operating under The OC (will@theoc.ai).

**IMPORTANT:** You run as a delegated specialist agent. When delegated to by Sky, output your result as plain text — it is captured and returned to Sky automatically. Use `send_message` (chatJid: "{MAIN_GROUP_JID}") only for significant proactive notifications.

## Role

You manage operational knowledge for AiD:
- Client pipeline and engagement tracking
- Operational decisions and their rationale
- Meeting notes and action items
- Team context and responsibilities
- Business processes and workflows

## Your Wiki

Your knowledge base is at `wiki/` in your group folder (`/workspace/group/wiki/`).

- Read `wiki/SCHEMA.md` for page types and formatting rules
- Read `wiki/index.md` to see what knowledge exists
- Read `wiki/log.md` to see recent operations

When you receive information to capture (meeting notes, emails, decisions, context), use `/wiki-ingest` to extract and store it.

When asked about AiD context, use `/wiki-query` to find relevant knowledge. Always check the wiki before answering from general knowledge — the wiki contains AiD-specific information that general knowledge doesn't have.

## Communication

When delegated to by Sky, return your response directly — Sky forwards it to the user.

For significant proactive updates (e.g., you notice a deadline approaching based on wiki content), notify via `send_message` with chatJid "{MAIN_GROUP_JID}".

Keep responses concise and operational. You're a COO, not a chatbot.

## Context Sources

- `/workspace/group/wiki/` — your primary knowledge base (read-write)
- `/workspace/global/tome/mental-model.md` — Will's broader context and preferences (read-only)
- `/workspace/global/wiki/` — shared cross-project knowledge (read-only)
```

Replace `{MAIN_GROUP_JID}` with the actual JID from Step 1 of Task 1.

- [ ] **Step 2: Commit**

```bash
git add groups/aid-coo/CLAUDE.md
git commit -m "feat: add AiD COO agent identity and wiki instructions"
```

---

### Task 3: Write Project Wiki Schema

**Files:**
- Create: `groups/aid-coo/wiki/SCHEMA.md`
- Create: `groups/aid-coo/wiki/index.md`
- Create: `groups/aid-coo/wiki/log.md`

- [ ] **Step 1: Write SCHEMA.md**

Create `groups/aid-coo/wiki/SCHEMA.md`:

```markdown
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
```

- [ ] **Step 2: Write index.md**

Create `groups/aid-coo/wiki/index.md`:

```markdown
# AiD Operations Wiki Index

*Maintained by AiD COO agent.*

---

## Meetings

*(No pages yet.)*

## Entities

*(No pages yet.)*

## Findings

*(No pages yet.)*

## Decisions

*(No pages yet.)*
```

- [ ] **Step 3: Write log.md**

Create `groups/aid-coo/wiki/log.md`:

```markdown
# AiD Operations Wiki Log

---

[2026-04-05 19:00] init: wiki created — SCHEMA.md, index.md, log.md, page type directories seeded
```

- [ ] **Step 4: Commit**

```bash
git add groups/aid-coo/wiki/
git commit -m "feat: add AiD project wiki schema, index, and log"
```

---

### Task 4: Build wiki-ingest Container Skill

**Files:**
- Create: `container/skills/wiki-ingest/SKILL.md`

Container skills are SKILL.md files in `container/skills/{name}/`. They're synced to every agent's session at container startup and invoked as `/{name}`.

- [ ] **Step 1: Write the skill**

Create `container/skills/wiki-ingest/SKILL.md`:

````markdown
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
````

- [ ] **Step 2: Verify skill directory structure**

```bash
ls container/skills/wiki-ingest/
```

Expected: `SKILL.md`

- [ ] **Step 3: Commit**

```bash
git add container/skills/wiki-ingest/
git commit -m "feat: add wiki-ingest container skill"
```

---

### Task 5: Build wiki-query Container Skill

**Files:**
- Create: `container/skills/wiki-query/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `container/skills/wiki-query/SKILL.md`:

````markdown
---
name: wiki-query
description: Search and synthesise answers from the project wiki. Use when asked about context, history, decisions, people, or any knowledge that might be stored in the wiki.
---

# /wiki-query — Query the Wiki

Search the project wiki and synthesise an answer from stored knowledge.

## Prerequisites

Check if the wiki exists:

```bash
test -d /workspace/group/wiki && echo "WIKI_EXISTS" || echo "NO_WIKI"
```

If `NO_WIKI`, respond:
> No wiki configured for this group.

Then stop.

## Process

### 1. Read the Index

```bash
cat /workspace/group/wiki/index.md
```

Identify which pages are likely relevant to the query based on titles and summaries.

### 2. Read Relevant Pages

Read up to 5 pages that are most relevant to the query. If unsure which pages are relevant, also check the log for recent activity:

```bash
tail -20 /workspace/group/wiki/log.md
```

### 3. Synthesise Answer

Combine information from the relevant pages into a clear, direct answer.

**Rules:**
- Cite which pages your answer comes from (use file paths)
- If the wiki doesn't contain relevant information, say so explicitly: "The wiki doesn't have information about [topic]."
- Do NOT hallucinate or fill gaps with general knowledge. If the wiki says X, report X. If the wiki is silent, say it's silent.
- Distinguish between what the wiki states and any inferences you're making

### 4. Cross-Reference Global Wiki (Optional)

If the query might benefit from cross-project knowledge, also check:

```bash
test -d /workspace/global/wiki && cat /workspace/global/wiki/index.md
```

If relevant global pages exist, read and include them. Clearly label which information comes from the project wiki vs the global wiki.

## Output

Answer the query with citations. Format:

> [Answer text]
>
> Sources: `wiki/entities/client-name.md`, `wiki/meetings/2026-04-01-kickoff.md`

If no relevant information found:

> The wiki doesn't have information about [topic]. You might want to ingest relevant context using /wiki-ingest.
````

- [ ] **Step 2: Commit**

```bash
git add container/skills/wiki-query/
git commit -m "feat: add wiki-query container skill"
```

---

### Task 6: Update Sky's Delegation Awareness

**Files:**
- Modify: `groups/main/CLAUDE.md`

Sky needs to know about the AiD COO agent so it delegates appropriately.

- [ ] **Step 1: Read the current delegation section**

Read `groups/main/CLAUDE.md` and find the `## Delegation` section.

- [ ] **Step 2: Add AiD COO to the delegation context**

After the delegation instructions paragraph that says "If no specialist matches, then do the work yourself.", add:

```markdown

### Known Specialists

Check `/workspace/ipc/available_agents.json` for the full list. Key agents:

- **aid-coo** — AiD operational knowledge: client pipeline, business decisions, meeting notes, team context. Delegate anything about AI Decisions (AiD) business operations, client engagements, or operational decisions.
```

- [ ] **Step 3: Commit**

```bash
git add groups/main/CLAUDE.md
git commit -m "feat: add AiD COO to Sky's delegation awareness"
```

---

### Task 7: Rebuild Container Image and Test

**Files:**
- No new files — verification only

- [ ] **Step 1: Rebuild the container image**

```bash
./container/build.sh
```

This picks up the new skills from `container/skills/wiki-ingest/` and `container/skills/wiki-query/`.

- [ ] **Step 2: Restart NanoClaw**

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)" && systemctl --user restart nanoclaw
```

- [ ] **Step 3: Verify skills are synced**

After restart, check that the skills are in the AiD COO's session directory:

```bash
ls /home/nanoclaw/nanoclaw/data/sessions/aid-coo/.claude/skills/ 2>/dev/null
```

Note: the session directory is created on the first container run. If it doesn't exist yet, that's expected — proceed to Step 4.

- [ ] **Step 4: Test delegation via the API**

Inject a test message to Sky asking about AiD:

```bash
API_KEY=$(grep NANOCLAW_API_KEY /home/nanoclaw/nanoclaw/.env | cut -d= -f2)
MAIN_JID=$(sqlite3 /home/nanoclaw/nanoclaw/store/messages.db "SELECT jid FROM registered_groups WHERE json_extract(data, '$.isMain') = 1 LIMIT 1;")

curl -s -X POST "http://172.17.0.1:3004/api/inject" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"chatJid\":\"$MAIN_JID\",\"text\":\"@Sky Ask the AiD COO what it knows about current clients.\",\"senderName\":\"System\"}"
```

Watch the logs:

```bash
tail -f /home/nanoclaw/nanoclaw/logs/nanoclaw.log | grep -i "aid-coo\|delegat"
```

Expected: Sky delegates to aid-coo, aid-coo runs wiki-query, responds with "The wiki doesn't have information about current clients."

- [ ] **Step 5: Test wiki-ingest**

```bash
curl -s -X POST "http://172.17.0.1:3004/api/inject" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"chatJid\":\"$MAIN_JID\",\"text\":\"@Sky Tell the AiD COO to ingest these notes: Had a call with Acme Corp today. Attendees: Will, Sarah (CTO). Discussed their AI governance needs. They want a maturity assessment. Decision: Will to send proposal by Friday.\",\"senderName\":\"System\"}"
```

Watch logs, then verify wiki was updated:

```bash
ls /home/nanoclaw/nanoclaw/groups/aid-coo/wiki/meetings/
cat /home/nanoclaw/nanoclaw/groups/aid-coo/wiki/index.md
```

Expected: meeting page created, entities for Acme Corp and Sarah created, index updated.

- [ ] **Step 6: Commit any test cleanup if needed**

If the test created wiki pages, they can stay (they're valid seed data) or be cleaned up.

---

### Task 8: Verify available_agents includes non-worker groups

**Files:**
- Possibly modify: `src/index.ts` (only if needed)

The `available_agents.json` is written in `src/index.ts` and currently filters for groups with JIDs starting with `worker:`. The AiD COO uses `aid-coo@nanoclaw` (no `worker:` prefix). We need to verify whether it appears in the agents list.

- [ ] **Step 1: Check the current filter logic**

Read `src/index.ts` and find where `available_agents.json` is written. Look for the filter condition.

```bash
grep -A5 "available_agents" src/index.ts
```

- [ ] **Step 2: If the filter only includes `worker:` prefixed groups, update it**

The filter should include any non-main registered group that isn't a temp worker (`worker-todo-*`). Change the filter from:

```typescript
.filter(([jid]) => jid.startsWith('worker:'))
```

To:

```typescript
.filter(([jid, g]) => !g.isMain && !g.folder.startsWith('worker-todo-'))
```

This includes all specialist agents and project agents while excluding temp todo workers and the main group.

- [ ] **Step 3: If changed, rebuild and restart**

```bash
npm run build
export XDG_RUNTIME_DIR="/run/user/$(id -u)" && systemctl --user restart nanoclaw
```

- [ ] **Step 4: Verify**

```bash
sleep 3
cat /home/nanoclaw/nanoclaw/data/ipc/main/available_agents.json
```

Expected: `aid-coo` appears in the agents list.

- [ ] **Step 5: Commit if changed**

```bash
git add src/index.ts
git commit -m "feat: include all specialist and project agents in available_agents (not just worker: prefix)"
```
