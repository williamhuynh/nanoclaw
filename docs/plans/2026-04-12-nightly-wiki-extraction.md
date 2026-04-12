# Nightly Wiki Extraction — Design Spec

Supersedes: `2026-04-11-knowledge-extraction-hook.md` (PreCompact hook approach — shelved as overengineered)

## Goal

Nightly scheduled task that reads unprocessed archived conversations and extracts structured knowledge into the group's wiki. Reuses the existing `wiki-ingest` skill and NanoClaw task scheduler — no new infrastructure, no hook modifications, no IPC plumbing.

## Why Not the Hook Approach

The previous plan hooked extraction into PreCompact — spawning ephemeral containers via IPC on every compaction. Problems:
1. Haiku quality unvalidated — building plumbing before proving value
2. Blocking a lifecycle hook for 3 minutes is fragile
3. Full container per extraction is heavy (50+/day across groups)
4. Direct wiki writes with no review step
5. Pollutes core `ContainerInput` interface with extraction-only fields
6. File-based IPC polling is a hack

This plan: one scheduled task per group, runs nightly, uses existing task scheduler and wiki-ingest skill. Zero code changes.

## Design

### How It Works

```
Nightly cron fires (task-scheduler.ts)
  │
  ├── 1. Container starts in group context (existing plumbing)
  │
  ├── 2. Read conversations/.last-wiki-extraction for last processed filename
  │      (missing file = never extracted, process all)
  │
  ├── 3. Glob conversations/*.md, filter to files after the marker
  │      (files are named YYYY-MM-DD-conversation-HHMM.md — lexicographic sort = chronological)
  │
  ├── 4. For each unprocessed conversation (oldest first, max 5 per run):
  │      a. Read the conversation file
  │      b. Run wiki-ingest process (skill already loaded in container)
  │      c. Update conversations/.last-wiki-extraction with this filename
  │
  └── 5. Report summary of what was extracted
```

### Tracking What's Been Processed

Single marker file: `conversations/.last-wiki-extraction`

Contains the filename (not path) of the last successfully processed conversation. Example:
```
2026-04-08-conversation-2021.md
```

On next run, glob all `*.md` files in `conversations/`, sort lexicographically, skip everything up to and including the marker filename. Process the rest.

Why a filename marker instead of a timestamp or list:
- Filenames are chronologically sortable by design (YYYY-MM-DD-conversation-HHMM.md)
- Single atomic write — no append corruption risk
- Easy to manually reset (delete the file to reprocess everything, or edit to reprocess from a specific point)

### Batching: Max 5 Conversations Per Run

First run may have a backlog (main has 12 archived conversations). Processing all in one container session risks context exhaustion and poor extraction quality on later items.

Cap at 5 per run. If there's a backlog, the task runs nightly and catches up over a few days. Not urgent — these are wiki writes, not real-time.

### Tome: Already Handled

The existing nightly `tome-observe` task (task-1775365523826-qzhril, cron `0 13 * * *`) already captures learning signals from conversations. The wiki extraction task focuses exclusively on wiki — no tome journal writes. Clean separation of concerns.

### Which Groups

A group qualifies if it has BOTH:
- `conversations/` directory with `.md` files
- `wiki/` directory with `SCHEMA.md`

Current state (2026-04-12):
| Group | Wiki | Conversations | Qualifies |
|-------|------|---------------|-----------|
| main | yes | 12 files | **yes** |
| aid-coo | yes | 0 files | not yet (will qualify when conversations accumulate) |
| naa-project | yes | 0 files | not yet |
| homeschoollms-dev | no | 12 files | no (no wiki) |
| tandemly-dev | no | 11 files | no (no wiki) |

Start with `main` only. Other groups auto-qualify once they have archived conversations — just create a task for them when that happens.

### Schedule

Cron: `0 15 * * *` (3 PM UTC = 1 AM AEST)

Runs after the tome-observe task (1 PM UTC) so journal entries from today are captured before wiki extraction runs. Not a hard dependency — just nice ordering.

### Task Prompt

```
Nightly wiki extraction: process unprocessed archived conversations into the wiki.

## Process

1. Read `conversations/.last-wiki-extraction` to find the last processed filename.
   If the file doesn't exist, this is the first run — all conversations are unprocessed.

2. List all .md files in `conversations/` and sort them. Skip everything up to and
   including the marker filename. The remaining files are unprocessed.

3. If no unprocessed conversations, report "No new conversations to process" and stop.

4. Process up to 5 conversations, oldest first. For each:
   a. Read the full conversation file
   b. Analyse it for extractable knowledge: entities, findings, decisions, meetings
   c. Follow the wiki-ingest process: check SCHEMA.md, read index.md, create/update
      pages, update index.md, update log.md, update registry.md
   d. After successful extraction, update `conversations/.last-wiki-extraction`
      with this conversation's filename

5. Report a summary: conversations processed, pages created/updated, anything deferred.

## Rules
- Follow wiki/SCHEMA.md strictly for page types and mutability rules
- Max 10 wiki page operations total across all conversations in this run
- Skip trivial conversations (very short, only greetings, only debugging output)
- When in doubt about whether something is worth extracting, skip it —
  a quiet wiki is better than a noisy one
- Update the marker file after EACH conversation (not at the end) so partial
  runs don't lose progress
```

## Implementation

### Step 1: Create the Scheduled Task

Create via NanoClaw's MCP todo/task tools or directly through the message interface. The task needs:
- `group_folder`: `main`
- `schedule_type`: `cron`
- `schedule_value`: `0 15 * * *`
- `prompt`: (see Task Prompt above)
- `chat_jid`: main group's chat JID
- `context_mode`: `fresh` (each run is independent)

### Step 2: Backlog Processing

Main has 12 archived conversations. At 5/night, the backlog clears in 3 nights. No special handling needed.

### Step 3: Monitor Quality

After the first few runs, review:
- `wiki/log.md` — are the operations sensible?
- Created wiki pages — are entities meaningful, not noise?
- `wiki/index.md` — is dedup working (no duplicate pages)?

If quality is poor, options:
- Refine the task prompt (add examples, tighten extraction criteria)
- Switch model (env var override in the group's container settings)
- Add a `wiki/pending/` staging step (future improvement, not v0)

### Step 4: Expand to Other Groups

When aid-coo or naa-project start accumulating conversations, create identical tasks for those groups (just change `group_folder`).

## What This Doesn't Do (and That's Fine)

- **Real-time extraction**: Knowledge lands in wiki ~24h after the conversation. For wiki content, this delay is acceptable.
- **Cross-group extraction**: Each group extracts its own conversations. Cross-group promotion uses the existing `#promote` flow in wiki-ingest.
- **Tome journal writes**: Handled by the separate tome-observe nightly task.
- **Review/approval step**: Direct writes to wiki (same as manual wiki-ingest). If quality proves problematic, add staging in a future iteration.

## Rollout

1. Create the task for `main`
2. Let it run for 3-4 nights (clears backlog + processes new conversations)
3. Review extraction quality
4. If good, create tasks for other groups as they qualify
