---
name: dev-debugging
description: Systematic debugging for autonomous agents. Find root cause before fixing. Evidence before guesses. No random fix attempts.
---

# Systematic Debugging (Autonomous Agent)

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes. This is self-enforced — no one is watching, but the discipline prevents wasted work.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

BEFORE attempting ANY fix:

1. **Read Error Messages Carefully** — Full stack traces. Line numbers. Error codes. Don't skim.

2. **Reproduce Consistently** — Can you trigger it reliably? What are the exact steps? If not reproducible, gather more data.

3. **Check Recent Changes** — `git log --oneline -10`, `git diff HEAD~5`. What changed that could cause this?

4. **Gather Evidence in Multi-Component Systems** — Before proposing fixes, add diagnostic logging at each component boundary:
   - Log what enters each component
   - Log what exits each component
   - Run once to see WHERE it breaks
   - THEN investigate that specific component

5. **Trace Data Flow** — Where does the bad value originate? What called this with the bad value? Keep tracing backward until you find the source. Fix at the source, not at the symptom.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — Locate similar working code in the codebase
2. **Compare Against References** — Read reference implementations COMPLETELY. Don't skim.
3. **Identify Differences** — What's different between working and broken?
4. **Understand Dependencies** — What other components does this need?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y." Be specific.
2. **Test Minimally** — Smallest possible change. One variable at a time.
3. **Verify** — Did it work? Yes → Phase 4. No → new hypothesis. Don't stack fixes.

### Phase 4: Implementation

1. **Create Failing Test** — Reproduce the bug as a test. Use the dev-tdd skill.
2. **Implement Single Fix** — One change addressing root cause. No "while I'm here" improvements.
3. **Verify Fix** — Test passes? No other tests broken? Issue resolved?
4. **If fix doesn't work after 3 attempts** — STOP. The problem may be architectural. Report to user via Telegram with your findings and ask for guidance. Do not attempt fix #4 without input.

## Self-Enforcement Checkpoints

1. **Before writing any fix:** "Have I completed Phase 1?" If no, stop.
2. **Before committing a fix:** "Do I understand the root cause?" If "probably" or "maybe", you don't. Go back to Phase 1.
3. **After 3 failed fixes:** Stop. Report findings to user. This is likely an architectural problem.

## Red Flags — STOP and Return to Phase 1

- "Just try changing X and see"
- "Quick fix for now"
- "I don't fully understand but this might work"
- Proposing solutions before tracing data flow
- Fixing where the error appears instead of where it originates

## When to Escalate to User

Send a message via `mcp__nanoclaw__send_message` when:
- 3+ fix attempts have failed
- Root cause is unclear after thorough investigation
- Fix requires architectural changes
- Fix would change existing behavior significantly
- You need access to something you don't have

Include in your message:
- What you investigated (phases 1-3 findings)
- What you tried and why it didn't work
- Your current best hypothesis
- What you recommend as next steps
