---
name: add-tome
description: Install ToME-AI (Theory of Mind Expanded for AI). Clones the external tome repo, ensures container runner mounts it, and adds CLAUDE.md references. Safe to re-run after upstream merges.
---

# Add ToME-AI

Install the ToME-AI framework into NanoClaw. ToME lives in a standalone repo at `~/tome` (configurable via `TOME_DIR` env var). The container runner mounts it and syncs skills automatically.

Safe to re-run — all steps are idempotent.

## Pre-flight

Check current state:

```bash
# Check if tome repo exists
ls -la ~/tome/ 2>/dev/null

# Check if container runner imports TOME_DIR
grep -n 'TOME_DIR' src/container-runner.ts

# Check if global CLAUDE.md has ToME reference
grep -n 'ToME' groups/global/CLAUDE.md
```

## Step 1: Clone or Create ToME Repo

If `~/tome` does not exist, either clone it from the user's remote or create the structure:

```bash
# Option A: Clone from remote
git clone <remote-url> ~/tome

# Option B: Create fresh
mkdir -p ~/tome/journal ~/tome/skills
touch ~/tome/journal/.gitkeep
```

If creating fresh, create `~/tome/mental-model.md` from this template:

```markdown
# Mental Model

*Last Updated: YYYY-MM-DD*

---

## Current Goals

### Immediate (This Week)
*To be populated through observation*

### Short-term (This Month)
*To be populated through observation*

### Long-term (This Quarter)
*To be populated through observation*

---

## Values & Priorities

*To be populated through observation.*

---

## Communication Preferences

*To be populated through observation.*

---

## Knowledge State

### Expert
### Proficient
### Learning

---

## Behavioral Patterns

### Mode Signals
- **Exploration**: "what if", "brainstorm", "should I consider"
- **Implementation**: "let's do", "start with", "make this"
- **Clarification**: "I meant", "to be clear"
- **Reflection**: "how did that go", "what worked"

---

## Recent Learning Events

*Top 5-10 events, rotated.*
```

Also create `~/tome/.gitignore`:

```gitignore
journal/*
!journal/.gitkeep
review-draft.md
```

And `~/tome/CLAUDE.md` — see the tome repo's own CLAUDE.md for the template.

## Step 2: Verify Container Runner

The container runner should already import `TOME_DIR` from config and mount `~/tome` into containers. Verify:

```bash
grep 'TOME_DIR' src/container-runner.ts
grep 'TOME_DIR' src/config.ts
```

If `TOME_DIR` is NOT in `src/config.ts`, add it:

```typescript
// ToME mental model directory (external repo, portable across environments)
export const TOME_DIR = path.resolve(
  process.env.TOME_DIR || path.join(HOME_DIR, 'tome'),
);
```

If the container runner still uses `path.join(GROUPS_DIR, 'global', 'tome')`, update both mount blocks (main and non-main) to use `TOME_DIR` instead.

The container runner should also sync skills from `TOME_DIR/skills/` in addition to `container/skills/`. Check for:

```bash
grep 'tomeSkillsSrc' src/container-runner.ts
```

## Step 3: Add CLAUDE.md Reference

Check if `groups/global/CLAUDE.md` already has a ToME section:

```bash
grep 'ToME' groups/global/CLAUDE.md
```

If NOT present, append to `groups/global/CLAUDE.md`:

```markdown

## ToME

ToME data is at `/workspace/global/tome/`.
Always run `/init-tome` at the start of every session to load the mental model and activate ToME behavior.
```

## Step 4: Verify Skills in ToME Repo

Confirm the four skills exist in `~/tome/skills/`:

```bash
ls ~/tome/skills/init-tome/SKILL.md
ls ~/tome/skills/tome-observe/SKILL.md
ls ~/tome/skills/tome-adapt/SKILL.md
ls ~/tome/skills/tome-review/SKILL.md
```

If any are missing, they need to be created in the tome repo.

## Step 5: Verify

```bash
# ToME repo exists
ls -la ~/tome/mental-model.md

# Container runner uses TOME_DIR
grep 'TOME_DIR' src/container-runner.ts

# CLAUDE.md reference
grep 'ToME' groups/global/CLAUDE.md

# Skills exist in tome repo
ls ~/tome/skills/*/SKILL.md

# Tests pass
npm test

# Build succeeds
npm run build
```

Report results.

## Configuration

Set `TOME_DIR` in `.env` to override the default `~/tome` path:

```bash
TOME_DIR=/path/to/your/tome
```

## Removal

To remove ToME-AI from NanoClaw:

1. Remove `TOME_DIR` import and both tome mount blocks from `src/container-runner.ts`
2. Remove the tome skills sync block from `src/container-runner.ts`
3. Remove both tome mount tests from `src/container-runner.test.ts`
4. Remove the ToME section from `groups/global/CLAUDE.md`
5. Remove `TOME_DIR` from `src/config.ts`
6. `npm test && npm run build`

The `~/tome` repo is independent and can be kept or deleted separately.
