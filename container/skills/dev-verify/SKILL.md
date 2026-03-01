---
name: dev-verify
description: Verification before claiming completion. Run tests, check build, confirm output before any success claims. Evidence before assertions.
---

# Verification Before Completion (Autonomous Agent)

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this step, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = unverified claim
```

## What Requires Verification

| Claim | Command Required | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Full test suite output: 0 failures | Previous run, "should pass" |
| Lint clean | Linter output: 0 errors | Partial check |
| Build succeeds | Build command: exit 0 | Linter passing |
| Bug fixed | Reproduce original symptom: passes | Code changed, assumed fixed |
| Feature complete | Run feature end-to-end | Unit tests passing |

## Self-Enforcement

Before any of these actions, run the gate function:
- Sending a "done" or "fixed" message to user
- Creating a PR
- Committing with a message implying completion
- Moving to the next task

## Red Flags — STOP and Verify

- Using "should", "probably", "seems to"
- About to commit without running tests
- About to create PR without build check
- Thinking "just this once"
- Relying on a previous test run (not fresh)

## Notification Pattern

When reporting completion to user, always include evidence:

```
Fix complete: [description]

Tests: npm test → 42/42 passed (exit 0)
Lint: npm run lint → 0 errors, 0 warnings
Build: npm run build → exit 0

PR: [link]
```

Never:
```
Fix complete: [description]
Everything looks good!
```
