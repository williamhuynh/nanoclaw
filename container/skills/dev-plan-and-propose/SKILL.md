---
name: dev-plan-and-propose
description: Plan before implementing. Explore the codebase, design an approach, propose it to the user via Telegram, and wait for approval before writing code. Use for any non-trivial change.
---

# Plan and Propose (Autonomous Agent)

## Overview

Before implementing any non-trivial change, explore the codebase, design an approach, and get user approval via Telegram. This prevents wasted work on wrong approaches.

**Core principle:** Understand before building. Propose before implementing.

## When to Use

**Always** for:
- New feature implementations
- Changes spanning 3+ files
- Architectural decisions
- Anything you're unsure about

**Skip for:**
- Auto-fix tier changes (clear root cause, <20 lines)
- Direct instructions from user with specific implementation details

## The Process

### Step 1: Explore

Before proposing anything:
- Read relevant source files
- Understand existing patterns and conventions
- Check for related tests
- Identify dependencies and potential side effects
- Check the project README, docs, or CONTRIBUTING guide if available

### Step 2: Design

Consider 2-3 approaches:
- What are the trade-offs of each?
- Which fits the existing codebase patterns best?
- Which is simplest (YAGNI)?
- What tests will you need?

### Step 3: Propose via Telegram

Send your proposal to the user using `mcp__nanoclaw__send_message`:

```
Plan for: [Feature/Fix Name]

Approach: [1-2 sentences describing your recommended approach]

Changes:
- [file1]: [what changes and why]
- [file2]: [what changes and why]

Testing:
- [what tests you'll write]

Alternatives considered:
- [approach B]: [why you didn't choose it]

Estimated scope: [N files, ~N lines]

Reply "go" to proceed, or suggest changes.
```

### Step 4: Wait for Approval

After sending the proposal, STOP. Do not proceed until the user replies. The user's reply will come as a follow-up message in the conversation.

- **"go" / "proceed" / "looks good"** → Proceed with implementation
- **User suggests changes** → Revise the plan and re-propose
- **"stop" / "cancel"** → Abandon the task

### Step 5: Implement

Once approved:
1. Invoke dev-tdd — write tests first
2. Implement the approved plan
3. Invoke dev-verify — verify everything passes
4. Use github-pr to create the PR
5. Notify user with PR link

## Self-Enforcement

- **Before writing any production code:** "Did I propose and get approval?" If no for non-trivial changes, stop and propose.
- **Scope creep check:** "Am I implementing what was approved, or adding extras?" Stick to the plan.
- **If you discover the plan needs to change mid-implementation:** Stop, send an updated proposal, wait for approval.

## Red Flags

- Starting to code before proposing
- "This is simple enough to skip the proposal"
- Adding features not in the approved plan
- Changing approach without re-proposing
