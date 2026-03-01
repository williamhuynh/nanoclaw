---
name: check-sentry
description: Poll Sentry for new unresolved errors, triage severity, and report or auto-fix. Use when triggered by scheduled task or when asked to check for errors.
---

# Check Sentry for Errors

## Overview

Poll the Sentry API for new unresolved issues since the last check. Triage each error by severity. Report findings to the user via Telegram. For small, clear bugs — invoke the auto-fix skill to determine if auto-fix is appropriate.

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
I'll auto-fix issues [N] and [N] — PRs will auto-merge in 1 hour. Reply "hold" on any PR to prevent merge.
```

### Step 6: Update Timestamp

```bash
date -u +%Y-%m-%dT%H:%M:%S > /workspace/group/.sentry-last-check
```

### Step 7: Act on Assessment

- **Auto-fixable:** Proceed immediately with the auto-fix skill. Clone the repo, make the fix, create the PR per the github-pr skill. The 1-hour hold window is the user's chance to intervene.
- **Needs PR / Needs attention:** Wait for user instructions.

## Self-Enforcement Checkpoints

1. **Before assessing severity:** "Did I read the full stack trace?" If you only read the title, go back and get the latest event details.
2. **Before reporting:** "Did I filter by last-check timestamp?" Don't report issues the user has already seen.
3. **After reporting:** "Did I update the timestamp?" If not, the same issues will appear next check.

## Error Handling

- If `.sentry-token` doesn't exist or API returns 401: report auth failure to user, do not retry.
- If API returns empty results: report "No new issues" and update timestamp.
- If API is unreachable: report network error, do not update timestamp (will retry next check).
