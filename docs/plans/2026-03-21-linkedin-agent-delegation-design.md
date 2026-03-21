# LinkedIn Agent & Delegation System — Design

## Overview

Separate LinkedIn posting from Sky (main agent) into a dedicated LinkedIn agent, introduce shared project contexts, and build a general-purpose delegation mechanism so any agent can request work from any other agent through the orchestrator.

This is the first step toward a multi-agent architecture where agents are organized by capability (LinkedIn posting, dev work, ads, etc.) and project context is shared separately.

## 1. Delegation IPC Mechanism

### Request Flow

1. Requesting agent writes a delegation request to its IPC directory:

```json
// /workspace/ipc/tasks/delegate_<timestamp>.json
{
  "type": "delegate",
  "targetGroup": "linkedin-agent",
  "prompt": "Write a LinkedIn post about...",
  "delegationId": "del-1742565284-abc123"
}
```

2. Orchestrator (`src/ipc.ts`) picks up the file, resolves `targetGroup` to its registered group entry, and calls `runContainerAgent` with the prompt.

3. Target agent runs in its own container with its own CLAUDE.md, memory, and context. It receives the prompt, does the work, produces output.

4. Orchestrator writes the result to the requesting agent's IPC input directory:

```json
// data/ipc/<source-group>/input/delegation_<delegationId>.json
{
  "type": "delegation_result",
  "delegationId": "del-1742565284-abc123",
  "status": "success",
  "result": "📝 LinkedIn Post Draft..."
}
```

5. Requesting agent reads the result from `/workspace/ipc/input/` and continues.

### Authorization

- Main group agents can delegate to any registered group.
- Non-main agents can only delegate to groups explicitly listed in their `containerConfig` (future extension).
- Target agent receives no elevated privileges from being delegated to.

### Timeouts

- Uses existing container timeout settings for the target group.
- If target times out, orchestrator writes an error result back to the requester.

### Delegation Targets

Delegation works with **any** registered group, not just worker groups:
- `"targetGroup": "linkedin-agent"` — worker group (no channel)
- `"targetGroup": "tandemly-dev"` — channel-connected dev group
- `"targetGroup": "homeschoollms-dev"` — channel-connected dev group

The delegation mechanism is orthogonal to how a group was registered or whether it has a channel.

## 2. Worker Group Registration

Worker groups are groups with no channel — they only run when delegated to.

### Synthetic JID Convention

Since registered groups are keyed by chat JID and worker groups have no channel, use a synthetic JID:
- `worker:linkedin-agent`
- `worker:code-review` (future)

### Behavior

- Never matched against incoming channel messages (message loop naturally excludes them).
- Can only be invoked via delegation IPC.
- Have their own container, folder, CLAUDE.md, session memory — identical to any other group.
- Follow same authorization rules.

### Registration

Added to `registered_groups` like any other group:

```json
{
  "worker:linkedin-agent": {
    "name": "LinkedIn Agent",
    "folder": "linkedin-agent",
    "trigger": "",
    "requiresTrigger": false,
    "added_at": "2026-03-21T00:00:00.000Z"
  }
}
```

No changes needed to container-runner, session management, or existing IPC — they all operate on folder names, not JIDs.

## 3. LinkedIn Agent Group

### Group Structure

```
groups/linkedin-agent/
├── CLAUDE.md          # LinkedIn expertise, workflow, anti-patterns
├── conversations/     # Past delegation history (for learning)
└── logs/
```

### CLAUDE.md Contents

- **Role:** "You are a LinkedIn content specialist for Will Huynh"
- **Workflow:** Full 3-stage post generation (draft → critique → refine)
- **Post structure:** Hook → Context → Insight → Optional CTA, 100–250 words
- **Weekly themes:** Monday (Risk/Governance), Wednesday (Ops/Lessons), Friday (Hot Take)
- **Critique loop:** 5 tests (Relevance, Objection, Insight, Action, Voice)
- **Anti-patterns:** Full banned AI-cliché phrases list
- **Context reference:** Read AI Decisions context from `/workspace/global/contexts/ai-decisions/`
- **ToME reference:** Read mental model from `/workspace/global/tome/mental-model.md` for Will's communication preferences
- **Output format:** Returns the final draft only — no intermediary reasoning

Content sourced from existing files:
- `groups/main/linkedin-post-generator/SKILL.md`
- `groups/main/linkedin-post-generator/references/voice-samples.md`
- `groups/main/linkedin-post-generator/references/critique-checklist.md`
- `groups/main/linkedin-post-generator/references/scheduling.md`

## 4. AI Decisions Shared Context

### Location

```
groups/global/contexts/ai-decisions/
├── brand.md     # Who AI Decisions is
├── voice.md     # How Will sounds
└── themes.md    # What to talk about
```

All non-main agents already get `/workspace/global/` mounted read-only, so the LinkedIn agent can read this without configuration changes.

### brand.md

- Will Huynh, The OC (will@theoc.ai)
- AI governance, risk, and operational insights
- Target audience: enterprise leaders
- Positioning: pragmatic AI governance authority
- "We've been in the trenches" credibility

### voice.md

Moved from `groups/main/linkedin-post-generator/references/voice-samples.md`:
- Voice patterns and signal phrases
- Sample posts
- Anti-patterns and banned AI-cliché phrases
- Tone guidelines

### themes.md

Moved from scheduling.md and critique-checklist.md:
- Content pillars: Risk/Governance, Operational Reality, Hot Takes
- Weekly structure (Mon/Wed/Fri themes)
- Quality gates

### Future Extension

When Tandemly marketing starts:
```
groups/global/contexts/tandemly/
├── brand.md
├── voice.md
└── themes.md
```

Same LinkedIn agent, different context — specified in the delegation prompt.

## 5. Sky's Updated Role

### CLAUDE.md Changes

- **Add:** "Delegation" section — how to delegate via IPC, list of available specialist agents
- **Remove:** LinkedIn post generation workflow (moved to LinkedIn agent)
- **Keep:** ai-news-monitor skill, scheduling, user interaction

### Scheduled Task Flow (Mon/Wed/Fri 8am)

**Current:**
1. Scheduler triggers Sky
2. Sky runs ai-news-monitor
3. Sky generates post using linkedin-post-generator skill
4. Sky sends draft to user

**New:**
1. Scheduler triggers Sky
2. Sky runs ai-news-monitor, picks a story
3. Sky writes delegation request: topic, context name (ai-decisions), theme (Monday/Wednesday/Friday)
4. Orchestrator spins up LinkedIn agent container
5. LinkedIn agent reads AI Decisions context + ToME, generates post
6. Result written back to Sky's IPC input
7. Sky reads result, forwards draft to user on Telegram

### On-demand & Revision Flow

- User asks Sky for a LinkedIn post → Sky delegates to LinkedIn agent → returns draft
- User requests revision → Sky re-delegates with original draft + feedback → returns revised draft

## 6. Files Removed / Moved

| Source | Destination | Action |
|--------|-------------|--------|
| `groups/main/linkedin-post-generator/SKILL.md` | `groups/linkedin-agent/CLAUDE.md` | Content merged into agent identity |
| `groups/main/linkedin-post-generator/references/voice-samples.md` | `groups/global/contexts/ai-decisions/voice.md` | Moved to shared context |
| `groups/main/linkedin-post-generator/references/critique-checklist.md` | `groups/linkedin-agent/CLAUDE.md` | Content merged into agent identity |
| `groups/main/linkedin-post-generator/references/scheduling.md` | `groups/global/contexts/ai-decisions/themes.md` | Moved to shared context |
| `container/skills/linkedin-post-generator/` | Removed | No longer needed as container skill |
| `groups/main/linkedin-post-generator/` | Removed | Content redistributed |
| `groups/main/linkedin-post-generator-summary.txt` | Removed | Superseded |

## 7. Core Code Changes

### src/ipc.ts — New "delegate" IPC command type

```
case 'delegate':
  // Resolve targetGroup to registered group
  // Spin up container with prompt
  // Write result back to source group's IPC input
```

### docs/ARCHITECTURE.md — Updated Customisation Points

| File | Customisation | Purpose |
|------|--------------|---------|
| `container/agent-runner/src/index.ts` | Usage metadata logging | Mission Control telemetry |
| `src/ipc.ts` | Delegation command handler | Agent-to-agent delegation via orchestrator |

### No changes to:

- `src/container-runner.ts` — delegation reuses existing `runContainerAgent`
- `src/index.ts` — message loop naturally excludes worker JIDs
- `src/router.ts` — delegation bypasses channel routing
- `container/agent-runner/` — agents write delegation requests using existing IPC file patterns

This aligns with the architecture principle of preferring agent-side tools over core engine changes. The only core change is the new IPC command type in `ipc.ts`.
