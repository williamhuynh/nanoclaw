# NanoClaw Customizations

Local modifications to the core NanoClaw engine. Referenced by `/update-nanoclaw` during merge conflict resolution to preserve intentional changes.

## Format

Each entry: **what** was changed, **why**, and **which files** were modified.

---

## Session auto-reset on "Prompt is too long" (2026-03-08)

**Problem:** Long coding sessions accumulate messages in the Claude Code session file. Even with compaction, the prompt eventually exceeds the context limit. Once stuck, every retry resumes the bloated session — infinite failure loop.

**Changes:**

- `container/agent-runner/src/index.ts`: Detect "Prompt is too long" result, delete the session `.jsonl` file and directory, retry with a fresh session. If it fails on a fresh session too (system prompt too large), exit with error.
- `src/index.ts`: Proactive session file size check before running the container — if the `.jsonl` exceeds 2MB, delete it and start fresh. Also clears host-side session (in-memory + DB) when container returns "Prompt is too long" error.
- `src/db.ts`: Added `deleteSession()` function.
