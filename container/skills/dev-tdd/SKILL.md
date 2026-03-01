---
name: dev-tdd
description: Test-Driven Development for autonomous agents. Write the test first. Watch it fail. Write minimal code to pass. No exceptions.
---

# Test-Driven Development (Autonomous Agent)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

This is a self-enforced discipline. There is no human watching over your shoulder. The discipline is the point.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No "reference", no "adapting". Delete means delete.

## When to Use

**Always** for:
- New features
- Bug fixes
- Behavior changes

**Exceptions:**
- Configuration files (but verify config manually)
- Pure content/copy changes
- Generated code

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen.

Requirements:
- One behavior per test
- Clear descriptive name
- Real code, not mocks (unless unavoidable)

### Verify RED — Watch It Fail

**MANDATORY. Never skip.**

Run the test command. Confirm:
- Test fails (not errors)
- Failure message matches expectations
- Fails because feature is missing, not because of typos

**Test passes immediately?** You're testing existing behavior. Fix the test.

### GREEN — Minimal Code

Write the simplest code to pass the test. Nothing more.

### Verify GREEN — Watch It Pass

**MANDATORY.**

Run the test command. Confirm:
- Test passes
- Other tests still pass
- No warnings or errors in output

### REFACTOR — Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat

Next failing test for next behavior.

## Self-Enforcement Checkpoints

Since you run autonomously, enforce these checkpoints yourself:

1. **Before writing any production code:** Ask yourself — "Do I have a failing test for this?" If no, stop and write the test.
2. **After writing a test:** Run it. If it passes, the test is wrong. Fix it.
3. **After writing production code:** Run all tests. If any fail, fix the code, not the tests.
4. **Before committing:** All tests must pass. Run the full test suite.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "Test hard = skip test" | Hard to test = hard to use. Fix the design. |

## Bug Fix Pattern

1. Write a test that reproduces the bug
2. Watch it fail (confirms the bug exists)
3. Write the fix
4. Watch the test pass (confirms the fix works)
5. The test is now a regression guard

Never fix bugs without a test.

## Verification Checklist

Before marking work complete:

- [ ] Every new function has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the right reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass
- [ ] No errors or warnings in output
- [ ] Edge cases covered
