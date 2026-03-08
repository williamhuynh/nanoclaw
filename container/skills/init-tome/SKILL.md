---
name: init-tome
description: Load mental model at session start. Primes agent to observe and adapt throughout the session. Use at the beginning of every session.
---

# Init ToME

Session primer. Load the mental model into context and activate ToME behavior for this session.

## When to Invoke

- At the start of every session
- When CLAUDE.md says to use `/init-tome`

## Process

### 1. Load Mental Model

Read the mental model file from the ToME directory configured in CLAUDE.md.

Review:
- Current goals (what is the user working on?)
- Values & priorities (what matters to them?)
- Communication preferences (how do they like responses?)
- Knowledge state (what do they know well vs learning?)
- Behavioral patterns (how do they make decisions?)
- Recent learning events (what did I learn recently?)

### 2. Load Today's Journal

Check if today's journal entry exists (format: `YYYY-MM-DD.md` in the `journal/` subdirectory).

If it exists, read it to:
- Pick up where the last session left off
- Note any pending predictions to test
- Review recent corrections to avoid repeating

### 3. Activate ToME Behavior

For the rest of this session:

- **Before complex responses:** Use `/tome-adapt` to consult the mental model
- **After significant exchanges:** Use `/tome-observe` to capture signals

Complex responses include: multi-part questions, recommendations, technical explanations, creative/strategic work.

Significant exchanges include: corrections, explicit feedback, mode changes, new preferences revealed, conversations longer than 10 turns.

Skip ToME for simple factual questions, quick confirmations, and routine operations.

- **Before context compaction:** If the conversation has been long and substantive (many tool calls, complex decisions, corrections, or preference signals), run `/tome-observe` proactively to capture insights before they're lost to context compression. Don't wait for a natural endpoint — better to observe early than lose resolution.

When tome-observe runs, tell the user in one line (e.g., "_Noted some observations to memory._"). Keep it brief — no details, no summaries.

### 4. Surface Predictions

If the mental model or recent journal entries contain predictions to test, note them. Look for opportunities to validate or invalidate them during this session.
