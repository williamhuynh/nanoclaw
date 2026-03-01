# HomeschoolLMS Dev Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Telegram-based NanoClaw group that autonomously monitors Sentry, auto-fixes small bugs, creates PRs for larger changes, and implements features on request for the HomeschoolLMS app.

**Architecture:** Agent-native approach — credentials stored as files in the group workspace, `gh` CLI added to the container image, 7 container skills encode development workflows. CLAUDE.md is the policy engine defining tiered autonomy. No engine changes beyond Dockerfile.

**Tech Stack:** Docker, gh CLI, Sentry REST API, NanoClaw container skills (Markdown), Telegram channel

**Design doc:** `docs/plans/2026-03-01-homeschoollms-dev-agent-design.md`

---

## Task 1: Add `gh` CLI to Container Dockerfile

**Files:**
- Modify: `container/Dockerfile`

**Step 1: Add gh CLI installation**

After the existing `apt-get install` block (which ends around line 27) and before the `npm install -g` line, add a new `RUN` block to install the GitHub CLI. The `gh` CLI is not in Debian's default repos, so we download the binary.

Add this after the `rm -rf /var/lib/apt/lists/*` line and before the `RUN npm install -g` line:

```dockerfile
# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*
```

**Step 2: Verify the build**

```bash
./container/build.sh
```

Expected: Build completes successfully.

**Step 3: Verify gh is available in the container**

```bash
docker run --rm nanoclaw-agent gh --version
```

Expected: `gh version X.Y.Z` output.

**Step 4: Commit**

```bash
git add container/Dockerfile
git commit -m "feat(container): add GitHub CLI (gh) to agent image"
```

---

## Task 2: Create Container Skill — `check-sentry`

**Files:**
- Create: `container/skills/check-sentry/SKILL.md`

**Step 1: Create the skill directory and file**

```bash
mkdir -p container/skills/check-sentry
```

Write `container/skills/check-sentry/SKILL.md` with this content:

```markdown
---
name: check-sentry
description: Poll Sentry for new unresolved errors, triage severity, and report or auto-fix. Use when triggered by scheduled task or when asked to check for errors.
---

# Check Sentry for Errors

## Overview

Poll the Sentry API for new unresolved issues since the last check. Triage each error by severity. Report findings to the user via Telegram. For small, clear bugs — invoke the `auto-fix` skill to determine if auto-fix is appropriate.

## Prerequisites

- `.sentry-token` file must exist in `/workspace/group/` containing a valid Sentry API auth token
- `.sentry-org` file must contain the Sentry organization slug
- `.sentry-project` file must contain the Sentry project slug

## Workflow

### Step 1: Load Credentials and State

```bash
SENTRY_TOKEN=$(cat /workspace/group/.sentry-token)
SENTRY_ORG=$(cat /workspace/group/.sentry-org)
SENTRY_PROJECT=$(cat /workspace/group/.sentry-project)
LAST_CHECK=$(cat /workspace/group/.sentry-last-check 2>/dev/null || echo "1970-01-01T00:00:00")
```

### Step 2: Query Sentry API

```bash
curl -s -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=date&statsPeriod=24h" \
  | jq '.'
```

### Step 3: Filter New Issues

Compare issue `firstSeen` timestamps against `$LAST_CHECK`. Only process issues first seen after the last check.

### Step 4: For Each New Issue

1. Read the issue details: title, culprit (endpoint/component), event count, first/last seen
2. Get the latest event for stack trace:
   ```bash
   curl -s -H "Authorization: Bearer $SENTRY_TOKEN" \
     "https://sentry.io/api/0/issues/{issue_id}/events/latest/" \
     | jq '.entries[] | select(.type == "exception")'
   ```
3. Assess severity:
   - **Auto-fixable:** Clear root cause, isolated to one file, likely <20 lines to fix (null check, off-by-one, missing error handling, typo)
   - **Needs PR:** Complex root cause, spans multiple files, unclear fix, >20 lines
   - **Needs attention:** Critical path, data loss risk, security implications

### Step 5: Report

Send a summary to the user via `mcp__nanoclaw__send_message`:

```
Sentry Daily Report:

[N] new unresolved issues found.

1. [TITLE] — [EVENT_COUNT] events
   Component: [CULPRIT]
   Stack: [TRUNCATED_STACK_TRACE]
   Assessment: [Auto-fixable / Needs PR / Needs attention]

[If auto-fixable items exist:]
I can auto-fix issues 1 and 3. Should I proceed, or would you like to review first?
```

### Step 6: Update Timestamp

```bash
date -u +%Y-%m-%dT%H:%M:%S > /workspace/group/.sentry-last-check
```

### Step 7: Act on Assessment

- **Auto-fixable:** If the user has previously approved auto-fixes for this session, invoke the `auto-fix` skill. Otherwise, wait for user confirmation via Telegram.
- **Needs PR / Needs attention:** Wait for user instructions.

## Error Handling

- If `.sentry-token` doesn't exist or API returns 401: report auth failure to user, do not retry.
- If API returns empty results: report "No new issues" and update timestamp.
- If API is unreachable: report network error, do not update timestamp (will retry next check).
```

**Step 2: Verify skill file is well-formed**

```bash
head -5 container/skills/check-sentry/SKILL.md
```

Expected: YAML frontmatter with `name` and `description`.

**Step 3: Commit**

```bash
git add container/skills/check-sentry/
git commit -m "feat(skills): add check-sentry container skill"
```

---

## Task 3: Create Container Skill — `github-pr`

**Files:**
- Create: `container/skills/github-pr/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/github-pr
```

Write `container/skills/github-pr/SKILL.md`:

```markdown
---
name: github-pr
description: Create branches, push changes, and manage pull requests using the gh CLI. Use for all GitHub operations.
---

# GitHub PR Workflow

## Overview

Manages the full PR lifecycle: branch creation, pushing changes, creating PRs, and handling auto-merge for auto-fix tier changes. Uses the `gh` CLI authenticated via a fine-grained PAT.

## Prerequisites

Before any GitHub operation, authenticate:

```bash
gh auth login --with-token < /workspace/group/.github-token
gh auth status
```

If auth fails, report to user and stop.

## Clone Repository

At the start of every session that needs code access:

```bash
cd /workspace/group
if [ ! -d "homeschoollms" ]; then
  gh repo clone [OWNER]/[REPO] homeschoollms
fi
cd homeschoollms
git pull origin main
```

Replace `[OWNER]/[REPO]` with the actual GitHub repo path (documented in group CLAUDE.md).

## Creating a PR

### For Auto-Fix Tier Changes

1. Create branch:
   ```bash
   git checkout -b auto-fix/$(date +%Y%m%d)-short-description
   ```

2. Make changes, stage, commit:
   ```bash
   git add [specific files]
   git commit -m "fix: [description of what was fixed and why]"
   ```

3. Push and create PR:
   ```bash
   git push -u origin HEAD
   gh pr create \
     --title "Auto-fix: [short description]" \
     --body "## Auto-Fix

   **Root cause:** [What caused the issue]
   **Fix:** [What was changed]
   **Tests:** [Test results]

   This PR was auto-generated and will auto-merge in 1 hour if no objections.

   ---
   *Generated by HomeschoolLMS Dev Agent*"
   ```

4. Notify user:
   ```
   Auto-fix PR created: [PR URL]

   Fix: [description]
   Changed: [file list]
   Tests: [pass/fail status]

   Will auto-merge in 1 hour. Reply "hold" to prevent merge.
   ```

5. The auto-merge after 1 hour is handled by a scheduled task (set up in CLAUDE.md). The agent does NOT wait — it creates the PR, notifies, and moves on.

### For PR Tier Changes

1. Create branch:
   ```bash
   git checkout -b dev/$(date +%Y%m%d)-short-description
   ```

2. Make changes, stage, commit (potentially multiple commits):
   ```bash
   git add [specific files]
   git commit -m "feat: [description]"
   ```

3. Push and create PR:
   ```bash
   git push -u origin HEAD
   gh pr create \
     --title "[type]: [short description]" \
     --body "## Summary
   [What this PR does and why]

   ## Changes
   [Bulleted list of changes]

   ## Test Results
   [Output of test/lint commands]

   ## Notes
   [Anything the reviewer should know]

   ---
   *Generated by HomeschoolLMS Dev Agent*"
   ```

4. Notify user:
   ```
   PR ready for review: [PR URL]

   [Summary of what was implemented]
   [Test results]

   Please review when you have a chance.
   ```

## Auto-Merge Check

When checking if an auto-fix PR should be merged (called by scheduled task):

```bash
# Get PR age
PR_CREATED=$(gh pr view [PR_NUMBER] --json createdAt --jq '.createdAt')
# Check if >1 hour old
# Check if no "hold" comment from user
gh pr view [PR_NUMBER] --json comments --jq '.comments[].body' | grep -i "hold"

# If >1 hour and no hold:
gh pr merge [PR_NUMBER] --merge --auto
```

## Error Handling

- Push rejected: report conflict to user, do not force push
- PR creation fails: report error with details
- Auth failure: report and stop, do not retry with bad credentials
```

**Step 2: Commit**

```bash
git add container/skills/github-pr/
git commit -m "feat(skills): add github-pr container skill"
```

---

## Task 4: Create Container Skill — `auto-fix`

**Files:**
- Create: `container/skills/auto-fix/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/auto-fix
```

Write `container/skills/auto-fix/SKILL.md`:

```markdown
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
1. Use the `github-pr` skill with the auto-fix branch pattern
2. PR title starts with "Auto-fix:"
3. Notify user on Telegram with 1-hour auto-merge window
4. User can reply "hold" to prevent merge

### PR tier:
1. Use the `github-pr` skill with the dev branch pattern
2. PR title describes the change clearly
3. Notify user on Telegram
4. Wait for review feedback

## Evidence Required

When notifying the user about an auto-fix, always include:
- What was broken and why
- What was changed (specific lines/files)
- Test results (command + output)
- Why this qualifies as auto-fix tier (reference checklist)
```

**Step 2: Commit**

```bash
git add container/skills/auto-fix/
git commit -m "feat(skills): add auto-fix tiered autonomy skill"
```

---

## Task 5: Create Container Skill — `dev-tdd`

Adapted from the host `test-driven-development` skill. Key adaptations: removes references to `AskUserQuestion` and "human partner", adds self-enforcement since the agent runs autonomously.

**Files:**
- Create: `container/skills/dev-tdd/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/dev-tdd
```

Write `container/skills/dev-tdd/SKILL.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add container/skills/dev-tdd/
git commit -m "feat(skills): add dev-tdd container skill (adapted from host TDD)"
```

---

## Task 6: Create Container Skill — `dev-debugging`

Adapted from the host `systematic-debugging` skill. Key adaptations: replaces "ask human partner" with async Telegram communication, removes references to host-only skills, keeps all 4 phases.

**Files:**
- Create: `container/skills/dev-debugging/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/dev-debugging
```

Write `container/skills/dev-debugging/SKILL.md`:

```markdown
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

1. **Create Failing Test** — Reproduce the bug as a test. Use the `dev-tdd` skill.
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
```

**Step 2: Commit**

```bash
git add container/skills/dev-debugging/
git commit -m "feat(skills): add dev-debugging container skill (adapted from host debugging)"
```

---

## Task 7: Create Container Skill — `dev-verify`

Adapted from the host `verification-before-completion` skill. Fully self-enforced.

**Files:**
- Create: `container/skills/dev-verify/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/dev-verify
```

Write `container/skills/dev-verify/SKILL.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add container/skills/dev-verify/
git commit -m "feat(skills): add dev-verify container skill (adapted from host verification)"
```

---

## Task 8: Create Container Skill — `dev-plan-and-propose`

Adapted from the host `brainstorming` + `writing-plans` skills. Key adaptation: replaces `AskUserQuestion` interactive loop with async Telegram communication. The agent explores, plans, sends the proposal, and waits for approval.

**Files:**
- Create: `container/skills/dev-plan-and-propose/SKILL.md`

**Step 1: Create the skill**

```bash
mkdir -p container/skills/dev-plan-and-propose
```

Write `container/skills/dev-plan-and-propose/SKILL.md`:

```markdown
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
1. Invoke `dev-tdd` — write tests first
2. Implement the approved plan
3. Invoke `dev-verify` — verify everything passes
4. Use `github-pr` to create the PR
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
```

**Step 2: Commit**

```bash
git add container/skills/dev-plan-and-propose/
git commit -m "feat(skills): add dev-plan-and-propose container skill (adapted from host brainstorming)"
```

---

## Task 9: Create Group Workspace and CLAUDE.md

This is the policy engine. The CLAUDE.md defines the agent's identity, project context, workflow rules, and skill invocation instructions.

**Files:**
- Create: `groups/homeschoollms-dev/CLAUDE.md`

**Note:** The `.github-token`, `.sentry-token`, `.sentry-org`, and `.sentry-project` files must be created manually by the user with their actual credentials. This task creates placeholder instructions but NOT the actual secret files.

**Step 1: Create the group directory**

```bash
mkdir -p groups/homeschoollms-dev/logs
```

**Step 2: Write the CLAUDE.md**

The user must customize the `[OWNER/REPO]`, Sentry org/project, and any project-specific details. Write `groups/homeschoollms-dev/CLAUDE.md`:

```markdown
# HomeschoolLMS Dev Agent

You are a development agent for the HomeschoolLMS application. You monitor for errors, fix bugs, and implement features — all autonomously with appropriate human oversight.

## Identity

- **Name:** Dev
- **Role:** Autonomous developer for HomeschoolLMS
- **Channel:** Telegram
- **Communication:** Use `mcp__nanoclaw__send_message` to message the user

## Project

- **Repo:** [OWNER/REPO] (GitHub)
- **Frontend:** Deployed on Vercel
- **Backend:** Deployed on Render
- **Monitoring:** Sentry (error tracking)
- **Stack:** [USER TO FILL: e.g., Next.js, Express, PostgreSQL, etc.]

## Session Startup

At the start of every session that needs code access:

1. Authenticate GitHub:
   ```bash
   gh auth login --with-token < /workspace/group/.github-token
   ```
2. Clone or update the repo:
   ```bash
   cd /workspace/group
   if [ ! -d "homeschoollms" ]; then
     gh repo clone [OWNER/REPO] homeschoollms
   fi
   cd homeschoollms
   git checkout main
   git pull origin main
   ```

## Skills — MUST USE

You have development workflow skills available. You MUST invoke them before acting:

| Situation | Skill to Invoke |
|-----------|----------------|
| Sentry check triggered | `/check-sentry` |
| About to commit any change | `/auto-fix` (to determine tier) |
| Creating a branch/PR | `/github-pr` |
| Implementing any feature or fix | `/dev-tdd` |
| Encountering a bug or failure | `/dev-debugging` |
| About to claim work is done | `/dev-verify` |
| Non-trivial change requested | `/dev-plan-and-propose` |

**If a skill applies, you MUST use it. No exceptions.**

## Tiered Autonomy Policy

### Auto-Fix Tier (PR + auto-merge after 1 hour)
- Lint/formatting, null checks, off-by-one, missing error handling, typos
- Must be <=20 lines, 1-2 files, clear root cause
- Always run tests before creating PR
- Notify user on Telegram — they have 1 hour to reply "hold"

### PR Tier (requires human review)
- Features, large fixes, refactors, config changes, anything uncertain
- Create PR with detailed description
- Notify user on Telegram
- Wait for feedback before further action

### When in doubt: PR tier. Always.

## Scheduled Tasks

### Daily Sentry Check
When triggered with "Check Sentry for new unresolved issues":
1. Invoke the `check-sentry` skill
2. Follow its workflow completely
3. Report findings to user

## Credentials

These files are in `/workspace/group/` (your working directory):
- `.github-token` — GitHub fine-grained PAT
- `.sentry-token` — Sentry API auth token
- `.sentry-org` — Sentry organization slug
- `.sentry-project` — Sentry project slug

**NEVER share, log, or include these values in messages, PRs, or commits.**

## Communication Style

- Be concise in Telegram messages
- Always include evidence (test output, error messages, PR links)
- When reporting errors: title, frequency, stack trace snippet, assessment
- When proposing work: approach, files affected, scope, testing plan
- When completing work: what changed, test results, PR link
```

**Step 3: Commit**

```bash
git add groups/homeschoollms-dev/
git commit -m "feat: create HomeschoolLMS dev agent group workspace and CLAUDE.md"
```

---

## Task 10: Register the Group and Set Up Scheduled Tasks

This task requires user interaction and a running NanoClaw instance. It cannot be fully automated in this plan.

**Step 1: User creates credential files**

The user must create these files manually (they contain secrets):

```bash
# GitHub fine-grained PAT (create at github.com/settings/tokens)
echo "ghp_YOUR_TOKEN_HERE" > groups/homeschoollms-dev/.github-token

# Sentry API token (create at sentry.io/settings/account/api/auth-tokens/)
echo "YOUR_SENTRY_TOKEN" > groups/homeschoollms-dev/.sentry-token

# Sentry org and project slugs
echo "your-org" > groups/homeschoollms-dev/.sentry-org
echo "homeschoollms" > groups/homeschoollms-dev/.sentry-project
```

**Step 2: Add credential files to .gitignore**

Check that `groups/homeschoollms-dev/.github-token`, `.sentry-token`, `.sentry-org`, and `.sentry-project` are covered by `.gitignore`. If not, add them.

**Step 3: Register the group via main channel**

Message the main channel (Sky) on WhatsApp or Telegram:

```
Register a new group:
- Name: HomeschoolLMS Dev
- Telegram chat ID: [get this by messaging /chatid to the Telegram bot in the target group]
- Folder: homeschoollms-dev
- Trigger: Dev
- Container timeout: 600000
```

Sky will use the `register_group` IPC tool to register it.

**Step 4: Set up the daily Sentry scheduled task**

Message the HomeschoolLMS Dev group on Telegram:

```
@Dev Set up a daily scheduled task to check Sentry for new unresolved issues. Run it every day at 9:00 AM.
```

The agent will use `mcp__nanoclaw__schedule_task` to create the cron task.

**Step 5: Customize the CLAUDE.md**

Update `groups/homeschoollms-dev/CLAUDE.md` with:
- The actual `[OWNER/REPO]` GitHub path
- The project's tech stack details
- Any project-specific conventions or patterns
- Test/lint/build commands for the project

**Step 6: Verify end-to-end**

Message the Telegram group:

```
@Dev Check your GitHub access and Sentry access. Report back.
```

Expected: Agent authenticates with both services and reports success.

---

## Task 11: Rebuild Container Image

**Step 1: Rebuild**

```bash
./container/build.sh
```

Expected: Build completes with `gh` CLI included.

**Step 2: Verify**

```bash
docker run --rm nanoclaw-agent gh --version
```

Expected: `gh version X.Y.Z`

**Step 3: Restart NanoClaw**

```bash
systemctl --user restart nanoclaw
```

---

## Task 12: End-to-End Testing

**Step 1: Test GitHub access**

Message Telegram group:
```
@Dev Clone the HomeschoolLMS repo and tell me the latest 3 commits on main.
```

Expected: Agent clones, reports commits.

**Step 2: Test Sentry access**

Message Telegram group:
```
@Dev Check Sentry for any current unresolved issues.
```

Expected: Agent polls Sentry API, reports findings (or "no issues").

**Step 3: Test auto-fix flow**

Message Telegram group:
```
@Dev There's a typo in [specific file]. The word "recieve" should be "receive". Fix it.
```

Expected: Agent clones repo, makes fix, runs tests, creates auto-fix PR, notifies you with PR link and 1-hour window.

**Step 4: Test feature request flow**

Message Telegram group:
```
@Dev Add a health check endpoint at /api/health that returns { status: "ok", timestamp: Date.now() }.
```

Expected: Agent invokes `dev-plan-and-propose`, sends plan to Telegram, waits for your approval before implementing.
