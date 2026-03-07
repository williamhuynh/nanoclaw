---
name: add-tome
description: Install ToME-AI (Theory of Mind Expanded for AI). Creates mental model files, patches container runner for write access, and adds CLAUDE.md references. Safe to re-run after upstream merges.
---

# Add ToME-AI

Install the ToME-AI framework into NanoClaw. This creates the mental model directory structure, ensures container write access, and wires up CLAUDE.md references.

Safe to re-run — all steps are idempotent.

## Pre-flight

Check current state:

```bash
# Check if tome directory exists
ls -la groups/global/tome/ 2>/dev/null

# Check if container runner has tome mount
grep -n 'tome' src/container-runner.ts

# Check if global CLAUDE.md has ToME reference
grep -n 'ToME' groups/global/CLAUDE.md
```

## Step 1: Create Directory Structure

```bash
mkdir -p groups/global/tome/journal
```

### Update .gitignore

The `.gitignore` has `groups/global/*` which ignores everything under `groups/global/`. Add these lines after the `!groups/global/CLAUDE.md` line to whitelist tome:

```gitignore
!groups/global/tome/
groups/global/tome/journal/*
!groups/global/tome/journal/.gitkeep
```

This tracks the `tome/` directory and mental model template, but ignores journal contents (runtime data) except the `.gitkeep` that preserves the directory structure.

Check if already present:

```bash
grep 'tome' .gitignore
```

### Create mental model template

Create a `.gitkeep` to track the journal directory:

```bash
touch groups/global/tome/journal/.gitkeep
```

If `groups/global/tome/mental-model.md` does not exist, create it from the template in `container/skills/init-tome/SKILL.md` or use this minimal template:

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

## Step 2: Patch Container Runner

Check if `src/container-runner.ts` already has the tome mount:

```bash
grep 'tomeDir' src/container-runner.ts
```

If NOT present, add tome mounts in **both** branches of `buildVolumeMounts()`:

**Main branch** (inside `if (isMain)`, after the group folder mount):

```typescript
    // ToME mental model directory (read-write, same path as non-main groups)
    const mainTomeDir = path.join(GROUPS_DIR, 'global', 'tome');
    if (fs.existsSync(mainTomeDir)) {
      mounts.push({
        hostPath: mainTomeDir,
        containerPath: '/workspace/global/tome',
        readonly: false,
      });
    }
```

**Non-main branch** (inside `else`, after the read-only global directory mount):

```typescript
    // ToME mental model directory (read-write for non-main groups)
    // Overlays the read-only global mount for just the tome/ subdirectory
    const tomeDir = path.join(GROUPS_DIR, 'global', 'tome');
    if (fs.existsSync(tomeDir)) {
      mounts.push({
        hostPath: tomeDir,
        containerPath: '/workspace/global/tome',
        readonly: false,
      });
    }
```

Also add tests in `src/container-runner.test.ts` that verify the tome mount appears in spawn args for **both** main and non-main groups when the tome directory exists. Follow the existing test patterns in that file (mock `existsSync` to return `true` for the tome path, check spawn args for the `-v` mount).

After patching:

```bash
npm test && npm run build
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
Use `/init-tome` at session start to load mental model context.
```

## Step 4: Verify Container Skills

Confirm the four portable skills exist in `container/skills/`:

```bash
ls container/skills/init-tome/SKILL.md
ls container/skills/tome-observe/SKILL.md
ls container/skills/tome-adapt/SKILL.md
ls container/skills/tome-review/SKILL.md
```

If any are missing, report which ones need to be created.

## Step 5: Verify

```bash
# Directory structure
ls -la groups/global/tome/
ls -la groups/global/tome/journal/

# Container runner patched
grep 'tomeDir' src/container-runner.ts

# CLAUDE.md reference
grep 'ToME' groups/global/CLAUDE.md

# Skills exist
ls container/skills/*/SKILL.md | grep tome

# Tests pass
npm test

# Build succeeds
npm run build
```

Report results.

## Removal

To remove ToME-AI:

1. Remove both tome mount blocks (main and non-main) from `src/container-runner.ts`
2. Remove both tome mount tests (main and non-main) from `src/container-runner.test.ts`
3. Remove the ToME section from `groups/global/CLAUDE.md`
4. Remove the tome `.gitignore` lines (3 lines after `!groups/global/CLAUDE.md`)
5. Delete `container/skills/init-tome/`, `container/skills/tome-observe/`, `container/skills/tome-adapt/`, `container/skills/tome-review/`
6. Optionally delete `groups/global/tome/` (preserves mental model data if kept)
7. `npm test && npm run build`
