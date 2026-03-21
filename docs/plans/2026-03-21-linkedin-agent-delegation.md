# LinkedIn Agent & Delegation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate LinkedIn posting from Sky into a dedicated agent, create shared AI Decisions context, and build a general-purpose agent-to-agent delegation mechanism via the orchestrator's IPC system.

**Architecture:** File-based IPC delegation: requesting agent writes a `delegate` task file → orchestrator picks it up, spins up target agent container, collects output, writes result back to requester's IPC input directory. LinkedIn agent is a persistent "worker group" with synthetic JID `worker:linkedin-agent`, no channel connection.

**Tech Stack:** Node.js/TypeScript, existing IPC watcher (`src/ipc.ts`), existing container runner (`src/container-runner.ts`), vitest for tests.

---

### Task 1: Add `runDelegation` callback to IpcDeps interface

**Files:**
- Modify: `src/ipc.ts:13-27` (IpcDeps interface)

**Step 1: Add the callback type to IpcDeps**

In `src/ipc.ts`, add a new method to the `IpcDeps` interface:

```typescript
export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendPhoto: (jid: string, filePath: string, caption?: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
  onTasksChanged: () => void;
  // Delegation: run a prompt in another group's container and return the result
  runDelegation: (
    targetFolder: string,
    prompt: string,
  ) => Promise<{ status: 'success' | 'error'; result: string | null; error?: string }>;
}
```

**Step 2: Verify build compiles (expect errors in index.ts and test — that's fine for now)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Errors about missing `runDelegation` property in index.ts and test file — confirms the interface change propagated.

**Step 3: Commit**

```bash
git add src/ipc.ts
git commit -m "feat(ipc): add runDelegation callback to IpcDeps interface"
```

---

### Task 2: Add `delegate` case to processTaskIpc

**Files:**
- Modify: `src/ipc.ts:191-495` (processTaskIpc function)

**Step 1: Add `delegate` fields to the data parameter type**

In `processTaskIpc`, add to the `data` type parameter (around line 191-209):

```typescript
    // For delegate
    targetGroup?: string;
    delegationId?: string;
```

**Step 2: Add the `delegate` case before the `default` case (around line 491)**

```typescript
    case 'delegate':
      // Agent-to-agent delegation: run prompt in target group's container
      if (!data.targetGroup || !data.prompt || !data.delegationId) {
        logger.warn(
          { sourceGroup, data },
          'Invalid delegate request - missing required fields',
        );
        break;
      }

      // Authorization: only main groups can delegate (for now)
      if (!isMain) {
        logger.warn(
          { sourceGroup, targetGroup: data.targetGroup },
          'Unauthorized delegate attempt blocked (non-main)',
        );
        break;
      }

      // Resolve target group by folder name
      {
        const targetFolder = data.targetGroup;
        const targetGroupEntry = Object.values(registeredGroups).find(
          (g) => g.folder === targetFolder,
        );
        if (!targetGroupEntry) {
          logger.warn(
            { sourceGroup, targetGroup: targetFolder },
            'Delegate target group not found',
          );
          // Write error result back to source
          const errorResultPath = path.join(
            DATA_DIR,
            'ipc',
            sourceGroup,
            'input',
            `delegation_${data.delegationId}.json`,
          );
          fs.mkdirSync(path.dirname(errorResultPath), { recursive: true });
          fs.writeFileSync(
            errorResultPath,
            JSON.stringify({
              type: 'delegation_result',
              delegationId: data.delegationId,
              status: 'error',
              result: null,
              error: `Target group "${targetFolder}" not found`,
            }),
          );
          break;
        }

        const delegationId = data.delegationId;
        const prompt = data.prompt;
        logger.info(
          { sourceGroup, targetGroup: targetFolder, delegationId },
          'Starting delegation',
        );

        // Fire-and-forget: don't block the IPC loop
        deps
          .runDelegation(targetFolder, prompt)
          .then((result) => {
            const resultPath = path.join(
              DATA_DIR,
              'ipc',
              sourceGroup,
              'input',
              `delegation_${delegationId}.json`,
            );
            fs.mkdirSync(path.dirname(resultPath), { recursive: true });
            fs.writeFileSync(
              resultPath,
              JSON.stringify({
                type: 'delegation_result',
                delegationId,
                status: result.status,
                result: result.result,
                error: result.error,
              }),
            );
            logger.info(
              {
                sourceGroup,
                targetGroup: targetFolder,
                delegationId,
                status: result.status,
              },
              'Delegation completed',
            );
          })
          .catch((err) => {
            const resultPath = path.join(
              DATA_DIR,
              'ipc',
              sourceGroup,
              'input',
              `delegation_${delegationId}.json`,
            );
            fs.mkdirSync(path.dirname(resultPath), { recursive: true });
            fs.writeFileSync(
              resultPath,
              JSON.stringify({
                type: 'delegation_result',
                delegationId,
                status: 'error',
                result: null,
                error: `Delegation failed: ${err instanceof Error ? err.message : String(err)}`,
              }),
            );
            logger.error(
              { sourceGroup, targetGroup: targetFolder, delegationId, err },
              'Delegation error',
            );
          });
      }
      break;
```

**Step 3: Verify TypeScript compiles (ipc.ts only)**

Run: `npx tsc --noEmit src/ipc.ts 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/ipc.ts
git commit -m "feat(ipc): add delegate command for agent-to-agent delegation"
```

---

### Task 3: Write delegation authorization tests

**Files:**
- Modify: `src/ipc-auth.test.ts`

**Step 1: Add `runDelegation` mock to test deps**

In the `beforeEach` block (around line 54-68), add the mock to the `deps` object:

```typescript
    runDelegation: async () => ({
      status: 'success' as const,
      result: 'mock delegation result',
    }),
```

**Step 2: Add delegation test suite at the end of the file**

```typescript
// --- delegate authorization ---

describe('delegate authorization', () => {
  it('main group can delegate to another group', async () => {
    let delegationCalled = false;
    deps.runDelegation = async (targetFolder, prompt) => {
      delegationCalled = true;
      expect(targetFolder).toBe('other-group');
      expect(prompt).toBe('do work');
      return { status: 'success', result: 'done' };
    };

    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do work',
        delegationId: 'del-test-1',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Fire-and-forget, so delegation is async — wait a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(delegationCalled).toBe(true);
  });

  it('non-main group cannot delegate', async () => {
    let delegationCalled = false;
    deps.runDelegation = async () => {
      delegationCalled = true;
      return { status: 'success', result: 'done' };
    };

    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'whatsapp_main',
        prompt: 'unauthorized',
        delegationId: 'del-test-2',
      },
      'other-group',
      false,
      deps,
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(delegationCalled).toBe(false);
  });

  it('rejects delegate with missing fields', async () => {
    let delegationCalled = false;
    deps.runDelegation = async () => {
      delegationCalled = true;
      return { status: 'success', result: 'done' };
    };

    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        // missing prompt and delegationId
      },
      'whatsapp_main',
      true,
      deps,
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(delegationCalled).toBe(false);
  });

  it('rejects delegate to non-existent group', async () => {
    let delegationCalled = false;
    deps.runDelegation = async () => {
      delegationCalled = true;
      return { status: 'success', result: 'done' };
    };

    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'nonexistent-group',
        prompt: 'test',
        delegationId: 'del-test-3',
      },
      'whatsapp_main',
      true,
      deps,
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(delegationCalled).toBe(false);
  });
});
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run src/ipc-auth.test.ts`
Expected: All tests pass, including the new delegation tests.

**Step 4: Commit**

```bash
git add src/ipc-auth.test.ts
git commit -m "test(ipc): add delegation authorization tests"
```

---

### Task 4: Wire up runDelegation in index.ts

**Files:**
- Modify: `src/index.ts:800-841` (startIpcWatcher call)
- Reference: `src/index.ts:282-408` (runAgent function)

**Step 1: Add `runDelegation` to the startIpcWatcher deps**

In `src/index.ts`, find the `startIpcWatcher({...})` call (around line 801). Add the `runDelegation` callback alongside the existing deps:

```typescript
    runDelegation: async (targetFolder, prompt) => {
      // Find the registered group entry by folder name
      const targetEntry = Object.entries(registeredGroups).find(
        ([, g]) => g.folder === targetFolder,
      );
      if (!targetEntry) {
        return {
          status: 'error' as const,
          result: null,
          error: `Group with folder "${targetFolder}" not registered`,
        };
      }
      const [targetJid, targetGroup] = targetEntry;

      // Collect all output chunks into a single result
      let resultText: string | null = null;

      const status = await runAgent(
        targetGroup,
        prompt,
        targetJid,
        async (output) => {
          if (output.result) {
            const raw =
              typeof output.result === 'string'
                ? output.result
                : JSON.stringify(output.result);
            const text = raw
              .replace(/<internal>[\s\S]*?<\/internal>/g, '')
              .trim();
            if (text) {
              resultText = resultText ? `${resultText}\n\n${text}` : text;
            }
          }
          // Signal container to exit — delegation is single-query
          const ipcInputDir = path.join(
            DATA_DIR,
            'ipc',
            targetFolder,
            'input',
          );
          fs.mkdirSync(ipcInputDir, { recursive: true });
          fs.writeFileSync(path.join(ipcInputDir, '_close'), '');
        },
      );

      return {
        status: status === 'success' ? ('success' as const) : ('error' as const),
        result: resultText,
        error: status === 'error' ? 'Agent returned error' : undefined,
      };
    },
```

**Step 2: Verify build compiles**

Run: `npm run build`
Expected: Clean compile with no errors.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): wire up runDelegation to container runner"
```

---

### Task 5: Create AI Decisions shared context

**Files:**
- Create: `groups/global/contexts/ai-decisions/brand.md`
- Create: `groups/global/contexts/ai-decisions/voice.md`
- Create: `groups/global/contexts/ai-decisions/themes.md`

**Step 1: Create directory**

Run: `mkdir -p groups/global/contexts/ai-decisions`

**Step 2: Create brand.md**

Content extracted from `groups/main/linkedin-post-generator/SKILL.md` and ToME mental model (`groups/main/tome/mental-model.md`):

```markdown
# AI Decisions — Brand Context

## Who

- **Person:** Will Huynh
- **Company:** The OC (will@theoc.ai)
- **Role:** AI governance, risk, and operational insights

## Target Audience

Enterprise leaders — specifically:
- Risk and governance teams
- CIOs, CTOs, and operational leaders evaluating AI
- Compliance officers navigating AI regulation
- Anyone responsible for AI deployment decisions in large organisations

## Positioning

**Pragmatic AI governance authority.**

- "We've been in the trenches" credibility — insights from actual enterprise implementations, not abstract theory
- Challenges conventional wisdom — identifies execution gaps others miss
- Evidence-anchored — stats, research, real-world patterns
- Focused on what actually works vs. what sounds good on paper

## Key Themes

- AI governance debt (scaling AI faster than oversight)
- Operational reality of AI deployment
- Risk management for learning systems
- Gap between AI strategy and execution
- Agentic operations — AI as operational layer, not chatbot

## Products/Services

- AI Risk Navigator — self-service AI risk assessment tool built on Microsoft
- Consulting on AI governance, risk frameworks, and operational AI implementation
```

**Step 3: Create voice.md**

Move content from `groups/main/linkedin-post-generator/references/voice-samples.md` (the full file as-is — it's already well-structured):

Read the existing file and copy its content into `groups/global/contexts/ai-decisions/voice.md`.

**Step 4: Create themes.md**

Merge content from `groups/main/linkedin-post-generator/references/scheduling.md` (weekly theme structure, cadence) and `groups/main/linkedin-post-generator/references/critique-checklist.md` (quality gates):

```markdown
# AI Decisions — Content Themes & Quality

## Weekly Cadence

**Target:** 3 posts per week (Monday/Wednesday/Friday)
**Delivery:** 8:00 AM Sydney time

## Theme Structure

### Monday: Industry Insight / Risk Analysis
- AI regulation updates and compliance challenges
- Risk trends backed by data/stats
- Governance gaps in the industry
- What enterprises are getting wrong
- Pattern recognition across sectors

### Wednesday: Operational Reality / Lessons Learned
- Real implementation insights from work
- What actually works vs. what sounds good on paper
- Gaps between theory and practice
- Agentic operations examples
- Execution challenges

### Friday: Hot Take / Provocation
- Controversial or contrarian opinion
- Challenge conventional wisdom
- Patterns others are missing
- "Everyone says X, but the real issue is Y"
- Industry blind spots

## Quality Gates

Every post must pass ALL five tests. If it fails any, either fix it or skip it.

### 1. Relevance Test
- Why should enterprise risk/governance leaders care?
- Is this their problem or just interesting drama?
- Does this affect their day-to-day or decision-making?

### 2. Objection Test
- What's the obvious pushback or "so what?"
- Can I defend this claim against skepticism?
- Am I making logical leaps?

### 3. Insight Test
- Am I offering a unique POV or just commenting?
- What's the distinctive insight only Will could offer?
- Is this based on real patterns from enterprise work?

### 4. Action Test
- Can readers do something with this insight?
- Is there a governance/operational implication?

### 5. Voice Test
- Does this sound like Will? (professional + provocative)
- Am I being too salesy or too generic?
- Zero banned AI-cliché phrases?

## Quality Over Consistency

- Don't send weak content just to hit the 3/week target
- Will's credibility > consistency
- Skip and wait for better material rather than force irrelevant content
```

**Step 5: Commit**

```bash
git add groups/global/contexts/ai-decisions/
git commit -m "feat: create AI Decisions shared context docs"
```

---

### Task 6: Create LinkedIn agent group

**Files:**
- Create: `groups/linkedin-agent/CLAUDE.md`

**Step 1: Create directory**

Run: `mkdir -p groups/linkedin-agent/logs`

**Step 2: Create CLAUDE.md**

Compose from the existing `groups/main/linkedin-post-generator/SKILL.md`, critique checklist, and scheduling references. The key difference: this is now the agent's identity, not a skill. It reads context from `/workspace/global/contexts/ai-decisions/` and the ToME mental model.

```markdown
# LinkedIn Content Specialist

You are a LinkedIn content specialist for Will Huynh. You generate LinkedIn posts focused on AI governance, risk, and operational insights for enterprise leaders.

## Your Context Sources

Before writing any post, read:
1. `/workspace/global/contexts/ai-decisions/brand.md` — who Will is, his audience, positioning
2. `/workspace/global/contexts/ai-decisions/voice.md` — how Will sounds, sample posts, anti-patterns
3. `/workspace/global/contexts/ai-decisions/themes.md` — weekly themes and quality gates
4. `/workspace/global/tome/mental-model.md` — Will's communication preferences and values

## Core Workflow

You receive a delegation prompt with a topic (and optionally news content, theme day, or revision feedback). Follow this 3-stage process:

### Stage 1: Draft
- Generate 2-3 different angles on the topic
- Each with a different hook/framing

### Stage 2: Critique (CRITICAL — do not skip)
Run these 5 tests internally on each draft:

1. **Relevance:** Why should enterprise risk/governance leaders care?
2. **Objection:** What's the obvious "so what?" pushback? Can I defend it?
3. **Insight:** Am I offering a unique POV or just commenting on news?
4. **Action:** Can readers do something with this?
5. **Voice:** Does this sound like Will?

### Stage 3: Refine
- Incorporate critique findings
- Strengthen weak connections
- Pivot to adjacent angle if main story doesn't land
- Select the single best post

## Post Structure

**Hook (1-2 lines):** Stat/fact that challenges assumptions, or pattern observation
**Context (2-3 paragraphs):** Why this matters, what people get wrong, the gap
**Insight:** Pragmatic/contrarian view connected to governance/risk/operations
**Optional CTA (25% of posts):** Genuine question that drives comments

**Length:** 100-250 words

## Output Format

Return ONLY the final post. No intermediary drafts, no critique analysis, no explanations unless specifically asked.

Format:
```
📝 LinkedIn Post Draft - [Theme] - [Date]

[Post content]

---
Why this angle: [One sentence]
Recommended hashtags: #AIGovernance #AIRisk [relevant ones]
```

## Anti-Patterns: Banned AI-Cliché Phrases

These must NEVER appear in any post:
- "doing the heavy lifting"
- "the real question is"
- "here's the thing nobody is talking about"
- "that's the real story"
- "what most people miss"
- "this is where it gets interesting"
- "it's not about ___, it's about ___"
- "game-changer" / "game-changing"
- "in today's rapidly evolving landscape"
- "at the end of the day"
- "it's a wake-up call"
- "the elephant in the room"
- "let that sink in"
- "I've been thinking about this a lot"
- "unpacking" (as in "let me unpack this")
- "the bottom line is"
- "spoiler:" used as a rhetorical device
- Overuse of em-dashes for drama
- Lists of 3 that end with a twist

Write the way Will actually talks in meetings — direct, specific, sometimes blunt.

## When to Skip

If the topic doesn't pass the critique loop, say so. Return:
```
⏭️ Skipping — [reason]. This topic [doesn't pass relevance/can't defend against objections/lacks distinctive insight].
```

Quality over consistency. Will's credibility > hitting a posting target.
```

**Step 3: Commit**

```bash
git add groups/linkedin-agent/
git commit -m "feat: create LinkedIn agent group with CLAUDE.md"
```

---

### Task 7: Register the LinkedIn worker group

This must be done by Sky (main agent) via IPC at runtime, or manually in the database. For initial setup, insert directly.

**Files:**
- None modified — runtime registration

**Step 1: Register via the database**

Run the NanoClaw service or register manually. Since the orchestrator loads from DB at startup, we can insert directly:

```bash
cd /home/nanoclaw/nanoclaw
node -e "
const { initDatabase, setRegisteredGroup } = require('./dist/db.js');
initDatabase();
setRegisteredGroup('worker:linkedin-agent', {
  name: 'LinkedIn Agent',
  folder: 'linkedin-agent',
  trigger: '',
  requiresTrigger: false,
  added_at: new Date().toISOString(),
});
console.log('LinkedIn agent registered');
"
```

If `dist/` uses ESM, use this instead:

```bash
node --input-type=module -e "
import { initDatabase } from './dist/db.js';
import { setRegisteredGroup } from './dist/db.js';
initDatabase();
setRegisteredGroup('worker:linkedin-agent', {
  name: 'LinkedIn Agent',
  folder: 'linkedin-agent',
  trigger: '',
  requiresTrigger: false,
  added_at: new Date().toISOString(),
});
console.log('LinkedIn agent registered');
"
```

**Step 2: Verify registration**

Run: `sqlite3 data/nanoclaw.db "SELECT * FROM registered_groups WHERE jid = 'worker:linkedin-agent';"`
Expected: One row with the LinkedIn agent data.

**Step 3: No commit needed — runtime data only**

---

### Task 8: Update Sky's CLAUDE.md

**Files:**
- Modify: `groups/main/CLAUDE.md`

**Step 1: Add Delegation section**

After the "Scheduling for Other Groups" section (around line 250), add:

```markdown
---

## Delegation

You can delegate work to specialist agents. Write a JSON file to your IPC tasks directory:

```bash
echo '{"type":"delegate","targetGroup":"linkedin-agent","prompt":"Write a LinkedIn post about [topic]. Theme: [Monday Risk/Wednesday Ops/Friday Hot Take]. News context: [summary]","delegationId":"del-'$(date +%s)'-'$(head -c4 /dev/urandom | xxd -p)'"}' > /workspace/ipc/tasks/delegate_$(date +%s).json
```

The orchestrator runs the target agent and writes the result to `/workspace/ipc/input/delegation_<delegationId>.json`. Poll for the result:

```bash
# Wait for result (check every 5 seconds, up to 5 minutes)
for i in $(seq 1 60); do
  RESULT=$(ls /workspace/ipc/input/delegation_del-*.json 2>/dev/null | head -1)
  if [ -n "$RESULT" ]; then
    cat "$RESULT"
    rm "$RESULT"
    break
  fi
  sleep 5
done
```

### Available Specialist Agents

| Agent | Folder | Purpose |
|-------|--------|---------|
| LinkedIn Agent | `linkedin-agent` | Generate LinkedIn posts using AI Decisions context |

### LinkedIn Post Workflow

For LinkedIn posts (scheduled or on-demand):
1. Run ai-news-monitor to get content (if needed)
2. Delegate to `linkedin-agent` with topic, theme day, and news summary
3. Read the result from IPC input
4. Forward the draft to the user
5. If user requests revision, re-delegate with original + feedback
```

**Step 2: Remove or update LinkedIn post generator references**

If Sky's CLAUDE.md references the linkedin-post-generator skill directly, update those references to use delegation instead. (The current CLAUDE.md doesn't — the skill was registered separately. But verify and update if needed.)

**Step 3: Commit**

```bash
git add groups/main/CLAUDE.md
git commit -m "feat(sky): add delegation instructions and LinkedIn agent reference"
```

---

### Task 9: Clean up old LinkedIn files

**Files:**
- Remove: `container/skills/linkedin-post-generator/` (entire directory)
- Remove: `groups/main/linkedin-post-generator/` (entire directory)
- Remove: `groups/main/linkedin-post-generator-summary.txt`

**Step 1: Verify content has been migrated**

Check that all content from these files exists in either:
- `groups/linkedin-agent/CLAUDE.md` (workflow, critique loop, anti-patterns)
- `groups/global/contexts/ai-decisions/voice.md` (voice samples)
- `groups/global/contexts/ai-decisions/themes.md` (scheduling, quality gates)

**Step 2: Remove old files**

```bash
rm -rf container/skills/linkedin-post-generator/
rm -rf groups/main/linkedin-post-generator/
rm groups/main/linkedin-post-generator-summary.txt
```

**Step 3: Commit**

```bash
git add -A container/skills/linkedin-post-generator/ groups/main/linkedin-post-generator/ groups/main/linkedin-post-generator-summary.txt
git commit -m "chore: remove old LinkedIn skill files (migrated to linkedin-agent group)"
```

---

### Task 10: Update ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md:17-25` (Customisation Points table)

**Step 1: Add ipc.ts customisation point**

Add a row to the table:

```markdown
| `src/ipc.ts` | Delegation command handler | Agent-to-agent delegation via orchestrator IPC |
```

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add ipc.ts delegation to customisation points"
```

---

### Task 11: Build and integration test

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including new delegation authorization tests.

**Step 3: Manual smoke test**

Start NanoClaw (`npm run dev`), then from Sky's main chat:
1. Ask Sky to generate a LinkedIn post about a topic
2. Verify Sky writes a delegation IPC file
3. Verify orchestrator picks it up and runs LinkedIn agent container
4. Verify result appears in Sky's IPC input
5. Verify Sky forwards the draft to the user

**Step 4: Commit any fixes from smoke test**

---

### Task 12: Update scheduled tasks

The existing LinkedIn post scheduled tasks (Mon/Wed/Fri 8am) need their prompts updated to use delegation instead of the old skill.

**Step 1: Check current scheduled tasks**

Run: `sqlite3 data/nanoclaw.db "SELECT id, prompt FROM tasks WHERE prompt LIKE '%linkedin%';"`

**Step 2: Update task prompts**

Update each task's prompt to instruct Sky to delegate to the LinkedIn agent instead of using the linkedin-post-generator skill directly. The exact prompts depend on what's currently scheduled.

**Step 3: Verify tasks**

Run: `sqlite3 data/nanoclaw.db "SELECT id, prompt FROM tasks WHERE prompt LIKE '%linkedin%' OR prompt LIKE '%delegate%';"`
Expected: Updated prompts referencing delegation.
