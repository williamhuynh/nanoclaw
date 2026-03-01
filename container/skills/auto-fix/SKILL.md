---
name: auto-fix
description: Tiered autonomy decision engine. Determines whether a change qualifies for auto-fix (no human approval) or requires a PR for review. Use before committing any change.
---

# Auto-Fix Decision Engine

## Overview

Every change the agent makes must go through this decision engine. It determines whether the change qualifies for the auto-fix tier (PR + auto-merge after 1 hour) or the PR tier (requires human review).

## The Decision

```
BEFORE committing ANY change:

1. COUNT: How many lines changed? (git diff --stat)
2. SCOPE: How many files changed?
3. CLASSIFY: What type of change is this?
4. DECIDE: Auto-fix or PR tier?
5. ACT: Follow the appropriate workflow
```

## Auto-Fix Tier (PR + auto-merge after 1 hour)

A change qualifies for auto-fix ONLY if ALL of these are true:

- [ ] Total lines changed <= 20
- [ ] Change is in 1-2 files maximum
- [ ] Root cause is clear and unambiguous
- [ ] Change type is one of:
  - Lint/formatting fix
  - Null/undefined check
  - Off-by-one error
  - Missing error handling for obvious case
  - Typo in code or strings
  - Missing import
  - Type annotation fix
- [ ] Tests pass after the change
- [ ] No behavior change beyond the fix itself
- [ ] You are confident the fix is correct

**If ANY checkbox is unchecked: PR tier.**

## PR Tier (requires human review)

Everything else, including:

- Feature implementations (any size)
- Bug fixes >20 lines or spanning 3+ files
- Refactors
- Dependency updates
- Config/environment changes
- Any change you're not 100% confident about
- Changes that alter existing behavior beyond the fix

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "It's obviously correct" | Obvious things break. Follow the checklist. |
| "Just 21 lines, close enough" | 20 is the limit. PR tier. |
| "It's really 3 small fixes" | 3 files = PR tier. Bundle them. |
| "Tests pass so it's fine" | Tests passing is necessary, not sufficient. |
| "User won't care about this" | User set the policy. Follow it. |

## Workflow After Decision

### Auto-fix:
1. Use the github-pr skill with the auto-fix branch pattern
2. PR title starts with "Auto-fix:"
3. Notify user on Telegram with 1-hour auto-merge window
4. User can reply "hold" to prevent merge

### PR tier:
1. Use the github-pr skill with the dev branch pattern
2. PR title describes the change clearly
3. Notify user on Telegram
4. Wait for review feedback

## Evidence Required

When notifying the user about an auto-fix via `mcp__nanoclaw__send_message`, always include:
- What was broken and why
- What was changed (specific lines/files)
- Test results (command + output)
- Why this qualifies as auto-fix tier (reference checklist)
