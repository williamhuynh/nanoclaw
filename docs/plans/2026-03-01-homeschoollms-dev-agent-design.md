# HomeschoolLMS Dev Agent Group

## Overview

A NanoClaw group dedicated to developing and maintaining the HomeschoolLMS app. The agent monitors Sentry for errors, auto-fixes small issues, creates PRs for larger changes, and implements features on request — all via a Telegram group.

## Architecture: Agent-Native (Approach A)

Store credentials as files in the group workspace. Install `gh` CLI in the container image. Agent uses Bash + `gh` + `curl` for all GitHub/Sentry operations. CLAUDE.md defines the tiered autonomy policy. Container-side skills encode adapted development workflows.

Follows NanoClaw's architecture principle: prefer filesystem + existing tools over engine changes.

## Group Configuration

- **Name:** HomeschoolLMS Dev
- **Channel:** Telegram
- **Trigger name:** Dev (or similar)
- **Container timeout:** 600000ms (10 min for feature work)
- **No additional mounts** — agent clones repo fresh each session

## Code Access

Fresh `gh repo clone` on each session start. The agent clones the HomeschoolLMS monorepo (frontend + backend) into its workspace. CLAUDE.md instructs clone-first behavior. `.github-token` persists in the group workspace.

## Authentication

### GitHub
- Fine-grained Personal Access Token scoped to HomeschoolLMS repo
- Permissions: Contents (read/write), Pull Requests (read/write), Issues (read/write)
- Stored at `groups/homeschoollms-dev/.github-token`
- Used with `gh auth login --with-token` on session start
- Revocable instantly from GitHub Settings

### Sentry
- Sentry API auth token (org-level, read-only, Issues scope)
- Stored at `groups/homeschoollms-dev/.sentry-token`
- Used with `curl` against Sentry REST API

## Tiered Autonomy Policy

### Auto-fix tier (no human approval needed)
- Lint/formatting fixes
- Small bug fixes (~20 lines or fewer) with clear root cause
- Examples: null checks, off-by-one, missing error handling, typos

### Auto-fix workflow
1. Create branch `auto-fix/{description}`
2. Make the fix, run tests/lint
3. If tests pass → create PR
4. Send Telegram notification with PR link
5. Auto-merge after 1 hour if no objection from user

### PR tier (requires human review)
- Feature work requested by user
- Bug fixes >20 lines or spanning multiple files
- Refactors, dependency updates, config changes
- Anything the agent isn't confident about

### PR workflow
1. Create branch `dev/{description}`
2. Implement changes, run tests
3. Create PR with detailed description (what, why, test results)
4. Send Telegram notification with PR link
5. Wait for user feedback via Telegram

## Sentry Monitoring

- **Frequency:** Once daily (scheduled task)
- **Trigger:** Scheduled task wakes agent with "Check Sentry for new unresolved issues"
- **Mechanism:** `curl` with Sentry API token to query unresolved issues
- **State:** `.sentry-last-check` timestamp file tracks last poll
- **Reporting:** Error title, frequency, stack trace snippet, affected endpoint
- **Action:** Agent evaluates severity → auto-fix if small, alert user if large

## Infrastructure Changes

### Container Dockerfile
- Add `gh` CLI (GitHub's official CLI) — only engine change needed

### Group workspace files
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Identity, policy, project context, skill invocation rules |
| `.github-token` | Fine-grained PAT |
| `.sentry-token` | Sentry API token |
| `.sentry-last-check` | Timestamp of last Sentry poll |

### Scheduled tasks
- Daily Sentry check
- Optional daily PR cleanup (stale auto-fix PRs)

## Container Skills

7 skills in `container/skills/`, synced to all agents but only referenced by this group's CLAUDE.md.

### Core skills (specific to this dev agent)
| Skill | Purpose |
|-------|---------|
| `check-sentry` | Sentry API polling, error triage, severity assessment |
| `github-pr` | Branch creation, PR workflow, auto-merge after 1hr |
| `auto-fix` | Tiered autonomy decision logic — determines auto-fix vs PR |

### Adapted workflow skills (container-native versions of host skills)
| Skill | Adapted from | Key change |
|-------|-------------|------------|
| `dev-tdd` | test-driven-development | Self-enforced: write tests first, always |
| `dev-debugging` | systematic-debugging | Self-enforced: evidence before fixes, no guessing |
| `dev-verify` | verification-before-completion | Self-enforced: run tests/build before claiming done |
| `dev-plan-and-propose` | brainstorming + writing-plans | Async: explore → plan → send to Telegram for approval → implement |

Host skills use `AskUserQuestion` (interactive, blocking). Container skills use self-checkpoints and `mcp__nanoclaw__send_message` (async Telegram communication) instead.

## Feature Request Flow

1. User messages Telegram group: "Add a student progress dashboard"
2. Agent invokes `dev-plan-and-propose` skill
3. Agent clones repo, explores codebase, writes implementation plan
4. Agent sends plan summary to Telegram, waits for approval
5. User approves (or requests changes)
6. Agent invokes `dev-tdd` — writes tests first
7. Agent implements the feature
8. Agent invokes `dev-verify` — runs tests, checks build
9. Agent creates PR via `github-pr` skill
10. Agent notifies user on Telegram with PR link
