# AiD COO Agent + Wiki Skills — Design Spec

## Goal

Stand up a persistent project agent (AiD COO) that acts as the virtual Chief Operating Officer of AI Decisions, Will's AI consulting practice. The agent accumulates operational knowledge via a structured wiki. Two shared container skills (wiki-ingest, wiki-query) make the wiki system available to any project agent.

## Scope

**In scope:**
1. Register AiD COO as a persistent specialist agent
2. Scaffold group folder with wiki structure
3. Write CLAUDE.md (identity, wiki instructions, delegation target)
4. Build wiki-ingest container skill
5. Build wiki-query container skill
6. Wire Sky to delegate AiD-related tasks to the COO
7. Rebuild container image

**Out of scope (tracked as MC todos):**
- MC todo routing to project agents (project field on todos)
- Granola meeting notes pipeline
- Scheduled wiki lint/promotion reviews
- MC wiki viewer

---

## 1. AiD COO Agent

### Registration

| Field | Value |
|-------|-------|
| JID | `aid-coo@nanoclaw` |
| Folder | `aid-coo` |
| Name | `AiD COO` |
| Trigger | `@Sky` |
| requiresTrigger | `false` |
| isMain | not set (non-main) |

Registered via `register_group` IPC or directly in the DB. Sky discovers it via `available_agents.json` for delegation.

### Group Folder Structure

```
groups/aid-coo/
├── CLAUDE.md
├── wiki/
│   ├── SCHEMA.md      (project wiki schema — adapted from global)
│   ├── index.md       (empty catalog)
│   └── log.md         (empty operation log)
├── logs/
└── conversations/
```

### CLAUDE.md Identity

```
# AiD COO

You are the virtual Chief Operating Officer of AI Decisions (AiD), Will Huynh's AI governance consulting practice.

## Role

You manage operational knowledge for AiD:
- Client pipeline and engagement tracking
- Operational decisions and their rationale
- Meeting notes and action items
- Team context and responsibilities
- Business processes and workflows

## How You Work

You are a specialist agent. Sky delegates tasks to you when they relate to AiD operations. You may also receive direct messages via Claude Code or Mission Control.

When you receive information (meeting notes, decisions, context), use /wiki-ingest to capture it in your wiki. When asked about AiD context, use /wiki-query to find relevant knowledge.

Your wiki is at wiki/ in your group folder. Read wiki/SCHEMA.md for page format rules.

## Communication

When delegated to by Sky, return your response directly — Sky will forward it to the user. For significant updates or findings, also notify via send_message (chatJid: "{main_group_jid}").
```

The `{main_group_jid}` placeholder is replaced with Will's actual main group JID at registration time.

Additional sections inherited from the global template (groups/global/CLAUDE.md): memory, message formatting, IPC communication, container mounts, ToME.

---

## 2. Wiki Schema (Project-Level)

Adapted from the global wiki SCHEMA.md. Project wikis have different page types than the global wiki:

### Page Types

| Type | Directory | Mutability | Purpose |
|------|-----------|------------|---------|
| Meeting | `meetings/` | Immutable (append-only addendum) | Transcript extractions, action items, decisions |
| Entity | `entities/` | Evolving | People, organisations, systems — updated as knowledge grows |
| Finding | `findings/` | Evolving | Observations, analysis results, research summaries |
| Decision | `decisions/` | Append-only | Choices made, rationale, alternatives considered |

### Promotion

Pages can be tagged `#promote` in log.md when they contain reusable knowledge. Sky reviews and anonymises for the global wiki. Project agents do not write to the global wiki directly.

---

## 3. Container Skill: wiki-ingest

**Location:** `container/skills/wiki-ingest/SKILL.md`

**Trigger:** Agent receives content to capture — meeting notes, emails, documents, or explicit "ingest this" instruction.

**Behavior:**

1. Check if `wiki/` exists in the agent's group folder. If not, create the scaffold (SCHEMA.md, index.md, log.md, page type directories).
2. Read the input content.
3. Extract structured information:
   - Entities (people, organisations, systems) → `entities/` pages
   - Decisions (choices, rationale) → `decisions/` pages
   - Findings (observations, analysis) → `findings/` pages
   - Meeting notes → `meetings/YYYY-MM-DD-{topic}.md`
   - Action items → noted in the meeting page and flagged in log.md
4. For each extraction:
   - Check if a page already exists (read index.md). If yes, update it. If no, create it.
   - Follow SCHEMA.md formatting rules.
5. Update `index.md` with any new pages.
6. Append operations to `log.md`.
7. Cap at 10 page operations per invocation. If more are needed, note remaining in log.md for next run.

**Output:** Summary of what was captured — pages created/updated, key extractions.

---

## 4. Container Skill: wiki-query

**Location:** `container/skills/wiki-query/SKILL.md`

**Trigger:** Agent is asked about context that might be in the wiki — "what do we know about X?", "when did we decide Y?", "summarise the last meeting with Z".

**Behavior:**

1. Check if `wiki/` exists. If not, respond that no wiki is configured.
2. Read `index.md` to identify relevant pages based on the query.
3. Read the relevant pages (up to 5 pages per query to manage context).
4. Synthesise an answer from the wiki content.
5. Cite which pages the answer came from (file paths).
6. If the wiki doesn't contain relevant information, say so explicitly — don't hallucinate.

**Output:** Answer with citations, or "no relevant information found in the wiki."

---

## 5. Sky Delegation Wiring

Sky's CLAUDE.md already has delegation instructions and reads `available_agents.json`. Once aid-coo is registered, it appears in the agents list automatically.

Add a line to Sky's CLAUDE.md delegation section or the agent's description so Sky knows when to delegate:

> **aid-coo** — AiD operational knowledge: client pipeline, business decisions, meeting notes, team context. Delegate anything about AiD business operations.

---

## 6. Container Image Rebuild

After adding container skills, rebuild the agent container so the skills are available:

```bash
./container/build.sh
```

Skills are synced from `container/skills/` into each agent's session at container startup.

---

## Testing

1. Register aid-coo, scaffold folder
2. Tell Sky: "Ask the AiD COO what it knows about current clients" — should delegate, agent responds with empty wiki
3. Tell Sky: "Tell the AiD COO to ingest these meeting notes: [paste notes]" — should delegate, wiki-ingest creates pages
4. Tell Sky: "Ask the AiD COO to summarise what we discussed" — should delegate, wiki-query finds the ingested content
5. Check groups/aid-coo/wiki/ to verify files were created correctly
