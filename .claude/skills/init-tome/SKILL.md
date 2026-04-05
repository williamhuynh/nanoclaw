---
name: init-tome
description: Load mental model at session start. Primes agent to observe and adapt throughout the session. Use at the beginning of every session.
---

# Init ToME

Session primer. Load the mental model into context and activate ToME behavior for this session.

## When to Invoke

- At the start of every session
- When CLAUDE.md or agent config says to use `/init-tome`

## Prerequisites

The host environment (CLAUDE.md, agent.md, etc.) must specify the ToME directory path. The directory should contain:

- `mental-model.md` — the core mental model
- `journal/` — daily observation entries (YYYY-MM-DD.md)
- `.git/` — optional, enables auto-sync across devices

## Process

### 1. Sync Latest Data

If the ToME directory is a git repo, pull the latest before reading:

```bash
cd <tome-directory>
git fetch origin main 2>/dev/null
git merge --ff-only origin/main 2>/dev/null
```

**If the fast-forward merge fails** (local and remote have diverged), resolve it with an LLM merge:

1. Read both versions of `mental-model.md`:
   ```bash
   # Local version (your current file)
   cat mental-model.md
   # Remote version
   git show origin/main:mental-model.md
   ```

2. Merge them intelligently:
   - Combine observations from both — don't drop either side's additions
   - For confidence levels, take the higher value (more data = more confidence)
   - For goals, prefer the more recently dated version
   - Deduplicate hypotheses and learning events
   - Journal entries never conflict (different filenames), just ensure both sets exist

3. **Safety check before writing:** Compare the merged result to the local version. If more than 30% of the content would change, **stop and tell the user** — large divergences likely indicate a problem, not a normal merge. Show both versions and ask how to proceed.

4. If the merge is within the safety threshold, write the merged `mental-model.md`, then:
   ```bash
   git add -A
   git commit -m "tome: auto-merge diverged mental models $(date +%Y-%m-%d)"
   git push origin main 2>/dev/null || true
   ```

**If fetch fails** (offline, no remote), proceed silently with the local copy.

### 2. Load Mental Model

Read `mental-model.md` from the ToME directory.

Review:
- Current goals (what is the user working on?)
- Values & priorities (what matters to them?)
- Communication preferences (how do they like responses?)
- Knowledge state (what do they know well vs learning?)
- Behavioral patterns (how do they make decisions?)
- Recent learning events (what did I learn recently?)

### 3. Load Today's Journal

Check if today's journal entry exists (format: `YYYY-MM-DD.md` in the `journal/` subdirectory).

If it exists, read it to:
- Pick up where the last session left off
- Note any pending predictions to test
- Review recent corrections to avoid repeating

### 4. Activate ToME Behavior

For the rest of this session:

- **Before complex responses:** Use `/tome-adapt` to consult the mental model
- **After significant exchanges:** Use `/tome-observe` to capture signals

Complex responses include: multi-part questions, recommendations, technical explanations, creative/strategic work.

Significant exchanges include: corrections, explicit feedback, mode changes, new preferences revealed, conversations longer than 10 turns.

Skip ToME for simple factual questions, quick confirmations, and routine operations.

- **Before context compaction:** If the conversation has been long and substantive (many tool calls, complex decisions, corrections, or preference signals), run `/tome-observe` proactively to capture insights before they're lost to context compression. Don't wait for a natural endpoint — better to observe early than lose resolution.

When tome-observe runs, tell the user in one line (e.g., "_Noted some observations to memory._"). Keep it brief — no details, no summaries.

### 5. Surface Predictions

If the mental model or recent journal entries contain predictions to test, note them. Look for opportunities to validate or invalidate them during this session.
