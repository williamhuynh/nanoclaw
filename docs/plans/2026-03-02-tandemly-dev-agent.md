# Tandemly Dev Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `tandemly-dev` NanoClaw group that provides autonomous development assistance for the Tandemly finance app, mirroring the existing `homeschoollms-dev` pattern.

**Architecture:** New group folder with a CLAUDE.md tailored to Tandemly's stack (Next.js, Appwrite, OpenRouter). Reuses all existing container dev skills. Registered to a dedicated Telegram group.

**Tech Stack:** NanoClaw groups system, existing container skills (dev-tdd, dev-debugging, dev-verify, dev-plan-and-propose, auto-fix, github-pr)

---

### Task 1: Create the group folder and CLAUDE.md

**Files:**
- Create: `groups/tandemly-dev/CLAUDE.md`

**Step 1: Create the group directory**

```bash
mkdir -p groups/tandemly-dev
```

**Step 2: Write the CLAUDE.md**

Create `groups/tandemly-dev/CLAUDE.md` with this content:

```markdown
# Tandemly Dev Agent

You are a development agent for Tandemly (repo: financemanagementos). You monitor for errors, fix bugs, and implement features — all autonomously with appropriate human oversight.

## Identity

- **Name:** Dev
- **Role:** Autonomous developer for Tandemly
- **Channel:** Telegram
- **Communication:** Use `mcp__nanoclaw__send_message` to message the user

## Project

- **Repo:** williamhuynh/financemanagementos (GitHub, private)
- **Frontend:** Next.js, deployed on Vercel
- **Database:** Appwrite
- **Auth:** Appwrite
- **AI:** OpenRouter (model router)
- **Monitoring:** Not yet configured

## Session Startup

At the start of every session that needs code access:

1. Authenticate GitHub:
   ```bash
   gh auth login --with-token < /workspace/group/.github-token
   ```
2. Clone or update the repo:
   ```bash
   cd /workspace/group
   if [ ! -d "financemanagementos" ]; then
     gh repo clone williamhuynh/financemanagementos financemanagementos
   fi
   cd financemanagementos
   git checkout main
   git pull origin main
   ```

## Skills — MUST USE

You have development workflow skills available. You MUST invoke them before acting:

| Situation | Skill to Invoke |
|-----------|----------------|
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

### Auto-Fix PR Merge Check
When triggered with "Check for auto-fix PRs ready to merge":
1. List open PRs with "Auto-fix:" in the title
2. For each, check if >1 hour old and no "hold" comment
3. Merge eligible PRs via the github-pr skill
4. Notify user of any merges

## Credentials

These files are in `/workspace/group/` (your working directory):
- `.github-token` — GitHub fine-grained PAT

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
git add groups/tandemly-dev/CLAUDE.md
git commit -m "feat: add tandemly-dev group with CLAUDE.md"
```

---

### Task 2: Add the GitHub token

**Files:**
- Create: `groups/tandemly-dev/.github-token`

**Step 1: Ask the user for their GitHub PAT**

The token needs to be a fine-grained PAT scoped to `williamhuynh/financemanagementos` with read/write access to code, pull requests, and issues.

Ask: "Please provide your GitHub fine-grained PAT for the financemanagementos repo (or confirm if your existing token covers it)."

**Step 2: Write the token file**

```bash
echo -n "<TOKEN>" > groups/tandemly-dev/.github-token
chmod 600 groups/tandemly-dev/.github-token
```

**Step 3: Verify .gitignore covers token files**

Check that `.github-token` is in `.gitignore`. It should already be covered by the existing pattern. If not, add it.

---

### Task 3: Create a Telegram group and register it

**Step 1: Instruct the user to create a Telegram group**

The user needs to:
1. Create a new Telegram group (e.g., "Tandemly Dev")
2. Add their Sky bot to the group
3. Send a message in the group so NanoClaw sees the chat

**Step 2: Register the group via the main chat**

From the main NanoClaw chat (WhatsApp or Telegram), tell Sky:
```
@Sky register the Telegram group "Tandemly Dev" as tandemly-dev
```

This triggers the `register_group` IPC command which maps the Telegram group's chat JID to the `tandemly-dev` folder.

**Step 3: Verify registration**

Send a test message in the Tandemly Dev Telegram group:
```
@Sky what repo do you work on?
```

Expected: The agent responds with information about `williamhuynh/financemanagementos`.

---

### Task 4: Set up the auto-fix merge check scheduled task

**Step 1: Schedule the task via the main chat**

From the Tandemly Dev Telegram group:
```
@Sky schedule a daily task at 10:00 AM: "Check for auto-fix PRs ready to merge"
```

**Step 2: Verify the task is scheduled**

```
@Sky list my scheduled tasks
```

Expected: Shows the auto-fix merge check task with the correct schedule.
