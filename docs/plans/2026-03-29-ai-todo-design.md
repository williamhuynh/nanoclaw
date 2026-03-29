# AI-Native Todo System — Design

*2026-03-29*

## Overview

An AI-native todo system where humans and agents share a single task list. Todos are created via natural language brain dumps, AI-inferred metadata replaces manual forms, and agents can autonomously pick up, decompose, and complete tasks — notifying the human only when attention is needed.

## Principles

- **"What needs my attention?"** is the primary question — not "what's in progress?"
- **Zero-friction input** — brain dump text, AI handles the structuring
- **Agents are teammates** — they create, own, decompose, and complete todos alongside the human
- **Notify for action, stay quiet for progress** — only interrupt when human input is needed

## Architecture

Todos live in **Mission Control** (the productivity layer). Agents interact via **MCP tools** in their containers that call Mission Control's REST API. Brain dumps route through **NanoClaw** for AI parsing.

```
Browser ──WebSocket──> Mission Control ──NanoClaw API──> Agent Container
                                                              │
                                                    MCP todo tools
                                                              │
                                                   Mission Control API
                                                              │
                                                        SQLite DB
```

## Data Model

### todos table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | Todo title |
| description | TEXT | Optional details |
| status | TEXT | pending, in_progress, awaiting_review, completed, cancelled |
| horizon | TEXT | today, this_week, soon, none |
| owner | TEXT | "human" or agent folder name (e.g. "main", "linkedin-agent") |
| source | TEXT | manual, brain_dump, agent, meeting, channel |
| source_ref | TEXT | Meeting ID, message ID, etc. |
| context | TEXT | work, personal, admin (AI-inferred, user-editable) |
| result_content | TEXT | Agent's output when awaiting review (markdown) |
| sort_order | INTEGER | For drag-and-drop ordering within horizon |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### subtasks table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| todo_id | TEXT FK | References todos.id, ON DELETE CASCADE |
| title | TEXT NOT NULL | Subtask title |
| status | TEXT | pending, in_progress, completed, blocked |
| owner | TEXT | "human" or agent folder name |
| sort_order | INTEGER | Order within todo |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

## Brain Dump Input

Conversational chat-style input at the top of the todo page. Uses the existing WebSocket chat bridge (Mission Control → NanoClaw).

**Flow:**
1. User types free-form text (single item or multi-item brain dump)
2. Frontend sends via WebSocket to NanoClaw agent
3. Agent parses text into structured todos using ToME context for inference
4. Agent creates todos via MCP tools
5. If clarification needed, agent asks in the chat thread
6. Chat thread is collapsible — collapses to just the input when idle

**AI infers:**
- Number of distinct todos from a brain dump
- Horizon (today/this_week/soon) based on urgency cues and context
- Context (work/personal/admin) based on content
- Owner (human by default, agent if the user says "Sky, do X")

## Agent Interaction

### MCP Tools (container-side)

Agents get these tools via an MCP server in their container:

- `todo_list(status?, owner?, horizon?)` — list todos with optional filters
- `todo_create(title, description?, horizon?, owner?, context?, source?, source_ref?)` — create a todo
- `todo_update(id, status?, horizon?, owner?, result_content?, description?)` — update fields
- `todo_get(id)` — get a single todo with subtasks
- `subtask_create(todo_id, title, owner?)` — add a subtask
- `subtask_update(todo_id, subtask_id, status?, title?)` — update a subtask

These call Mission Control's REST API (localhost:3002) under the hood.

### Agent Picks Up Work

Two triggers:

1. **Immediate:** When owner changes from "human" to an agent, NanoClaw sends a message to that agent: "You've been assigned a todo: [title]. [description]."
2. **Daily cron (9:30am Sydney / 22:30 UTC):** Scheduled task checks for pending todos assigned to agents and nudges them.

Agent autonomy spectrum:
- **Familiar task** (e.g. LinkedIn post): agent executes autonomously, sets status to awaiting_review, writes output to result_content
- **Unfamiliar task**: agent puts together a short plan, asks for confirmation before proceeding
- **Decomposition**: agent creates subtasks, some owned by itself, some by "human"

### Agent Completes Work

1. Writes output to `result_content`
2. Sets status to `awaiting_review`
3. Sends Telegram notification: "Finished: [title] — review in Mission Control or reply here to approve"
4. Human reviews (in todo card or via Telegram reply)
5. Approve → completed. Feedback → agent revises.

## Frontend UI

### Layout

**Top: Conversational input**
- Chat-style text box, full width
- Collapsible chat thread for agent back-and-forth
- Placeholder: "What needs to be done?"
- Processing indicator while agent parses

**Middle: Todo list, grouped by horizon**
Three collapsible sections: **Today** | **This Week** | **Soon**

Each item shows:
- Left border colour: work=blue, personal=green, admin=grey
- Title
- Owner icon (person for human, bot icon + name for agents)
- Status badge (small, inline)
- Subtask progress indicator if applicable

Items needing attention float to top (awaiting_review, human-owned subtasks).

Expand a card to see:
- Description
- Subtasks with owners
- result_content rendered as markdown (for agent outputs)
- Quick actions: approve, reassign, change horizon, change context
- Tap context or horizon to cycle (no form needed)

Drag to reorder within a section.

**Bottom: Completed (collapsed by default)**
Recently completed items, last 7 days.

**No filters bar.** Horizon grouping + attention sorting replaces manual filtering. Search icon in header for text search across all todos.

## Notifications (Telegram)

| Event | Notify? |
|-------|---------|
| Agent picks up a task | Yes (for testing phase — can disable later) |
| Agent completes / awaiting review | Yes |
| Agent needs input / is stuck | Yes |
| Daily 9:30am digest | Yes — "X items for today, Y awaiting review" |
| Agent creates subtasks | No |
| AI re-prioritises horizon | No |

## Meeting Integration

**Phase 1 (now):** Paste meeting notes into brain dump chat. Agent extracts action items into todos with source="meeting".

**Phase 2 (future):** Scheduled task uses Granola MCP tools to auto-extract action items from recent meetings. Architecture supports this naturally — same MCP todo tools, different trigger.

## Seed Todos

Initial todos to populate the system:
- "Build Granola auto-extract for meeting action items" (context: personal, horizon: soon, source: manual)

## Migration

- Drop existing todos/subtasks tables
- Create new schema
- No data migration needed (current todos are test data)

## Out of Scope

- Multi-user / permissions
- Recurring todos
- Dependencies between todos (blocked-by)
- File attachments on todos
- Calendar integration
- Mobile app
