# Todo-Scoped Worker Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a todo is assigned to an agent, spin up an isolated worker container (`worker:todo-{id}`) instead of injecting into Sky's active session. Multiple workers run in parallel (up to 15). Feedback rounds resume the same worker session.

**Architecture:** NanoClaw gets a new `/api/workers` endpoint that registers ephemeral todo worker groups, creates group folders with generated CLAUDE.md (cloned from Sky's), and injects assignment messages. Todo workers get Sky-level mounts (ToME, SSH, Gmail, MC) but NOT `isMain` privileges. The existing `processGroupMessages` is modified to handle worker groups without a channel (workers communicate via IPC/MCP tools, not chat). On completion, worker folders are soft-deleted to `data/trash/` with a weekly HITL cleanup prompt. MAX_CONCURRENT_CONTAINERS raised to 15.

**Scope:** This applies only to todo workers (`worker:todo-*`), not existing specialist workers (`worker:llm-specialist` etc.) which keep their current behavior.

**Tech Stack:** TypeScript, Vitest, Node HTTP (NanoClaw API), Express (Mission Control)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/worker.ts` | Create | Worker lifecycle: register, generate CLAUDE.md, soft-delete, trash cleanup |
| `src/worker.test.ts` | Create | Unit tests for worker module |
| `src/config.ts` | Modify | Raise MAX_CONCURRENT_CONTAINERS default to 15 |
| `src/index.ts` | Modify | Handle worker groups in processGroupMessages (no channel required) |
| `src/container-runner.ts` | Modify | Todo workers get Sky-level mounts (not just non-main) |
| `src/container-runner-mounts.test.ts` | Modify | Test todo worker mount behavior |
| `src/api.ts` | Modify | Add `POST /api/workers` and `DELETE /api/workers/:todoId` endpoints |
| `src/api.test.ts` | Modify | Add worker endpoint tests |
| `MC: src/server/routes/todos.ts` | Modify | Assignment calls worker API; feedback targets worker JID; cleanup on completion |

(`MC:` prefix = `/home/nanoclaw/apps/mission-control/`)

---

### Task 1: Raise MAX_CONCURRENT_CONTAINERS to 15

**Files:**
- Modify: `src/config.ts:78-80`

- [ ] **Step 1: Update the default**

In `src/config.ts`, change:

```typescript
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '15', 10) || 15,
);
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: raise MAX_CONCURRENT_CONTAINERS default to 15"
```

---

### Task 2: Worker Module — Registration, CLAUDE.md, Soft-Delete

**Files:**
- Create: `src/worker.ts`
- Create: `src/worker.test.ts`

Core worker lifecycle: register a todo worker group, generate CLAUDE.md from Sky's template, soft-delete to trash on cleanup with path safety checks.

- [ ] **Step 1: Write failing tests**

Create `src/worker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const tmpDir = path.join(os.tmpdir(), `nanoclaw-worker-test-${Date.now()}`);
vi.mock('./config.js', () => ({
  DATA_DIR: path.join(tmpDir, 'data'),
  GROUPS_DIR: path.join(tmpDir, 'groups'),
  ASSISTANT_NAME: 'Sky',
}));

vi.mock('./db.js', () => ({
  setRegisteredGroup: vi.fn(),
  deleteRegisteredGroup: vi.fn(),
  deleteSession: vi.fn(),
}));

import {
  workerJid,
  workerFolder,
  isWorkerJid,
  isTodoWorkerFolder,
  createWorker,
  destroyWorker,
  generateWorkerClaudeMd,
  listTrash,
  purgeTrash,
} from './worker.js';
import { setRegisteredGroup, deleteRegisteredGroup, deleteSession } from './db.js';

describe('worker utilities', () => {
  describe('naming helpers', () => {
    it('workerJid builds JID from todo ID', () => {
      expect(workerJid('abc-123')).toBe('worker:todo-abc-123@nanoclaw');
    });

    it('workerFolder builds folder from todo ID', () => {
      expect(workerFolder('abc-123')).toBe('worker:todo-abc-123');
    });

    it('isWorkerJid detects todo worker JIDs only', () => {
      expect(isWorkerJid('worker:todo-abc@nanoclaw')).toBe(true);
      expect(isWorkerJid('worker:llm-specialist')).toBe(false);
      expect(isWorkerJid('6214124055@c.us')).toBe(false);
    });

    it('isTodoWorkerFolder detects todo worker folders only', () => {
      expect(isTodoWorkerFolder('worker:todo-abc')).toBe(true);
      expect(isTodoWorkerFolder('worker:llm-specialist')).toBe(false);
      expect(isTodoWorkerFolder('main')).toBe(false);
    });
  });

  describe('generateWorkerClaudeMd', () => {
    it('appends todo context to base template', () => {
      const base = '# Sky\n\nYou are Sky, a personal assistant.\n';
      const result = generateWorkerClaudeMd(base, {
        todoId: 'todo-1',
        title: 'Fix the bug',
        description: 'There is a bug in login flow',
      });
      expect(result).toContain('# Sky — Worker');
      expect(result).toContain('Fix the bug');
      expect(result).toContain('todo-1');
      expect(result).toContain('There is a bug in login flow');
      expect(result).toContain('awaiting_review');
    });

    it('handles missing description', () => {
      const base = '# Sky\n\nYou are Sky.\n';
      const result = generateWorkerClaudeMd(base, {
        todoId: 'todo-2',
        title: 'Quick task',
      });
      expect(result).toContain('Quick task');
      expect(result).not.toContain('undefined');
    });
  });

  describe('createWorker', () => {
    beforeEach(() => {
      fs.mkdirSync(path.join(tmpDir, 'groups', 'main'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'groups', 'main', 'CLAUDE.md'),
        '# Sky\n\nYou are Sky, a personal assistant.\n',
      );
      fs.mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates group folder with CLAUDE.md and returns registration', () => {
      const reg = createWorker({
        todoId: 'todo-abc',
        title: 'Test task',
        description: 'Do the thing',
        mainGroupFolder: 'main',
      });

      expect(reg.folder).toBe('worker:todo-todo-abc');
      expect(reg.requiresTrigger).toBe(false);
      expect(reg.isMain).toBeUndefined();

      const groupDir = path.join(tmpDir, 'groups', 'worker:todo-todo-abc');
      expect(fs.existsSync(groupDir)).toBe(true);
      expect(fs.existsSync(path.join(groupDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(groupDir, 'logs'))).toBe(true);

      const md = fs.readFileSync(path.join(groupDir, 'CLAUDE.md'), 'utf-8');
      expect(md).toContain('Test task');

      expect(setRegisteredGroup).toHaveBeenCalledWith(
        'worker:todo-todo-abc@nanoclaw',
        reg,
      );
    });
  });

  describe('destroyWorker', () => {
    beforeEach(() => {
      const workerDir = path.join(tmpDir, 'groups', 'worker:todo-xyz');
      fs.mkdirSync(path.join(workerDir, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(workerDir, 'CLAUDE.md'), '# Worker');

      const sessionDir = path.join(tmpDir, 'data', 'sessions', 'worker:todo-xyz');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'test.jsonl'), '{}');

      fs.mkdirSync(path.join(tmpDir, 'data', 'ipc', 'worker:todo-xyz', 'input'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('moves group folder and session to trash', () => {
      destroyWorker('xyz');

      expect(deleteRegisteredGroup).toHaveBeenCalledWith('worker:todo-xyz@nanoclaw');
      expect(deleteSession).toHaveBeenCalledWith('worker:todo-xyz');

      // Group folder moved out of groups/
      expect(fs.existsSync(path.join(tmpDir, 'groups', 'worker:todo-xyz'))).toBe(false);

      // Trash should contain the moved folder
      const trashDir = path.join(tmpDir, 'data', 'trash');
      expect(fs.existsSync(trashDir)).toBe(true);
      const trashEntries = fs.readdirSync(trashDir);
      expect(trashEntries.length).toBe(1);
      expect(trashEntries[0]).toMatch(/^worker:todo-xyz--\d{4}-\d{2}-\d{2}T/);
    });

    it('refuses to delete a non-todo-worker folder', () => {
      // Create a fake non-worker folder path
      const mainDir = path.join(tmpDir, 'groups', 'main');
      fs.mkdirSync(mainDir, { recursive: true });
      fs.writeFileSync(path.join(mainDir, 'CLAUDE.md'), '# Sky');

      // Try to destroy with a crafted ID that resolves to something dangerous
      // The folder safety check should prevent this
      destroyWorker('../../main');

      // main folder should still exist
      expect(fs.existsSync(mainDir)).toBe(true);
    });
  });

  describe('trash management', () => {
    beforeEach(() => {
      const trashDir = path.join(tmpDir, 'data', 'trash');
      fs.mkdirSync(trashDir, { recursive: true });

      // Create old trash entry (8 days ago)
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const oldEntry = path.join(trashDir, `worker:todo-old--${oldDate}`);
      fs.mkdirSync(oldEntry, { recursive: true });
      fs.writeFileSync(path.join(oldEntry, 'CLAUDE.md'), '# old');

      // Create recent trash entry (1 day ago)
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const recentEntry = path.join(trashDir, `worker:todo-recent--${recentDate}`);
      fs.mkdirSync(recentEntry, { recursive: true });
      fs.writeFileSync(path.join(recentEntry, 'CLAUDE.md'), '# recent');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('listTrash returns entries with age info', () => {
      const items = listTrash(7);
      expect(items.length).toBe(1);
      expect(items[0].name).toMatch(/worker:todo-old/);
      expect(items[0].path).toContain('data/trash');
    });

    it('purgeTrash deletes specified entries', () => {
      const items = listTrash(7);
      purgeTrash(items.map((i) => i.path));

      const trashDir = path.join(tmpDir, 'data', 'trash');
      const remaining = fs.readdirSync(trashDir);
      expect(remaining.length).toBe(1);
      expect(remaining[0]).toMatch(/worker:todo-recent/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/worker.test.ts`
Expected: FAIL — module `./worker.js` does not exist

- [ ] **Step 3: Implement the worker module**

Create `src/worker.ts`:

```typescript
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, GROUPS_DIR } from './config.js';
import { deleteRegisteredGroup, deleteSession, setRegisteredGroup } from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// ---------------------------------------------------------------------------
// Naming conventions
// ---------------------------------------------------------------------------

export function workerJid(todoId: string): string {
  return `worker:todo-${todoId}@nanoclaw`;
}

export function workerFolder(todoId: string): string {
  return `worker:todo-${todoId}`;
}

export function isWorkerJid(jid: string): boolean {
  return jid.startsWith('worker:todo-') && jid.endsWith('@nanoclaw');
}

export function isTodoWorkerFolder(folder: string): boolean {
  return folder.startsWith('worker:todo-');
}

// ---------------------------------------------------------------------------
// CLAUDE.md generation
// ---------------------------------------------------------------------------

export interface TodoContext {
  todoId: string;
  title: string;
  description?: string;
}

export function generateWorkerClaudeMd(
  baseTemplate: string,
  todo: TodoContext,
): string {
  const header = baseTemplate.replace(
    /^# \w+$/m,
    `# ${ASSISTANT_NAME} — Worker`,
  );

  const descBlock = todo.description
    ? `\n**Description:**\n${todo.description}\n`
    : '';

  const todoSection = `

---

## Current Assignment

**Todo ID:** ${todo.todoId}
**Title:** ${todo.title}
${descBlock}
## Worker Workflow

You are a worker container assigned to a single todo. Follow this workflow:

1. Set the todo status to "in_progress" using todo_update so the user knows you've started.
2. Do the work. Use all your available tools.
3. When done, use todo_update to:
   - Set status to "awaiting_review" (NEVER "completed" — only the user marks things completed)
   - Set result_content to a markdown summary of what you did. If result_content already has content from a previous feedback round, APPEND — do not overwrite.
4. Notify the user via send_message that the task is ready for review. Keep the notification short.

Use todo_get with id "${todo.todoId}" to see full details.
`;

  return header + todoSection;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export interface CreateWorkerOpts {
  todoId: string;
  title: string;
  description?: string;
  mainGroupFolder: string;
}

export function createWorker(opts: CreateWorkerOpts): RegisteredGroup {
  const folder = workerFolder(opts.todoId);
  const jid = workerJid(opts.todoId);

  // Read Sky's CLAUDE.md as base template
  const templatePath = path.join(GROUPS_DIR, opts.mainGroupFolder, 'CLAUDE.md');
  let baseTemplate = `# ${ASSISTANT_NAME}\n\nYou are ${ASSISTANT_NAME}, a personal assistant.\n`;
  if (fs.existsSync(templatePath)) {
    baseTemplate = fs.readFileSync(templatePath, 'utf-8');
  }

  // Create group folder
  const groupDir = path.join(GROUPS_DIR, folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Write CLAUDE.md with todo context
  const claudeMd = generateWorkerClaudeMd(baseTemplate, {
    todoId: opts.todoId,
    title: opts.title,
    description: opts.description,
  });
  fs.writeFileSync(path.join(groupDir, 'CLAUDE.md'), claudeMd);

  // Register group
  const registration: RegisteredGroup = {
    name: `Worker: ${opts.title.slice(0, 50)}`,
    folder,
    trigger: `@${ASSISTANT_NAME}`,
    added_at: new Date().toISOString(),
    requiresTrigger: false,
  };

  setRegisteredGroup(jid, registration);

  logger.info({ todoId: opts.todoId, folder }, 'Worker created');
  return registration;
}

export function destroyWorker(todoId: string): void {
  const jid = workerJid(todoId);
  const folder = workerFolder(todoId);

  // Path safety: validate folder matches expected pattern
  const groupDir = path.resolve(GROUPS_DIR, folder);
  if (
    !groupDir.startsWith(path.resolve(GROUPS_DIR)) ||
    !isTodoWorkerFolder(folder)
  ) {
    logger.error(
      { folder, groupDir },
      'Refusing to delete — path safety check failed',
    );
    return;
  }

  // Unregister from DB
  deleteRegisteredGroup(jid);
  deleteSession(folder);

  // Send close signal to any running container
  const ipcInputDir = path.join(DATA_DIR, 'ipc', folder, 'input');
  try {
    fs.mkdirSync(ipcInputDir, { recursive: true });
    fs.writeFileSync(path.join(ipcInputDir, '_close'), '');
  } catch { /* ignore */ }

  // Soft-delete: move group folder to trash
  const trashDir = path.join(DATA_DIR, 'trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const timestamp = new Date().toISOString();
  const trashName = `${folder}--${timestamp}`;
  const trashPath = path.join(trashDir, trashName);

  if (fs.existsSync(groupDir)) {
    fs.renameSync(groupDir, trashPath);
    logger.info({ folder, trashPath }, 'Worker folder moved to trash');
  }

  // Also move session folder to trash
  const sessionDir = path.join(DATA_DIR, 'sessions', folder);
  if (fs.existsSync(sessionDir)) {
    fs.renameSync(sessionDir, path.join(trashDir, `session-${trashName}`));
  }

  logger.info({ todoId, folder }, 'Worker destroyed');
}

// ---------------------------------------------------------------------------
// Trash management (HITL cleanup)
// ---------------------------------------------------------------------------

export interface TrashEntry {
  name: string;
  path: string;
  trashedAt: string;
  ageDays: number;
}

/**
 * List trash entries older than `minAgeDays`.
 */
export function listTrash(minAgeDays: number = 7): TrashEntry[] {
  const trashDir = path.join(DATA_DIR, 'trash');
  if (!fs.existsSync(trashDir)) return [];

  const now = Date.now();
  const entries: TrashEntry[] = [];

  for (const name of fs.readdirSync(trashDir)) {
    // Parse timestamp from folder name: worker:todo-xxx--2026-04-05T04:30:00.000Z
    const match = name.match(/--(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/);
    if (!match) continue;

    const trashedAt = match[1];
    const trashedMs = new Date(trashedAt).getTime();
    const ageDays = (now - trashedMs) / (24 * 60 * 60 * 1000);

    if (ageDays >= minAgeDays) {
      entries.push({
        name,
        path: path.join(trashDir, name),
        trashedAt,
        ageDays: Math.floor(ageDays),
      });
    }
  }

  return entries.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Permanently delete specified trash entries.
 * Called only after human confirmation.
 */
export function purgeTrash(paths: string[]): void {
  const trashDir = path.resolve(DATA_DIR, 'trash');

  for (const p of paths) {
    const resolved = path.resolve(p);
    // Safety: only delete entries inside the trash directory
    if (!resolved.startsWith(trashDir)) {
      logger.error({ path: p }, 'Refusing to purge — not inside trash directory');
      continue;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    logger.info({ path: p }, 'Trash entry purged');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/worker.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts src/worker.test.ts
git commit -m "feat: add worker module with soft-delete trash and HITL cleanup"
```

---

### Task 3: Add `deleteRegisteredGroup` to DB

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

The worker module needs `deleteRegisteredGroup`. Check if it exists first — if so, skip this task.

- [ ] **Step 1: Check if it exists**

Run: `grep -n 'deleteRegisteredGroup' src/db.ts`

If found, skip to Task 4.

- [ ] **Step 2: Write failing test**

Add to `src/db.test.ts` in the registered groups describe block:

```typescript
it('deleteRegisteredGroup removes the group', () => {
  setRegisteredGroup('worker:todo-test@nanoclaw', {
    name: 'Test Worker',
    folder: 'worker:todo-test',
    trigger: '@Sky',
    added_at: new Date().toISOString(),
  });

  const before = getAllRegisteredGroups();
  expect(before['worker:todo-test@nanoclaw']).toBeDefined();

  deleteRegisteredGroup('worker:todo-test@nanoclaw');

  const after = getAllRegisteredGroups();
  expect(after['worker:todo-test@nanoclaw']).toBeUndefined();
});
```

- [ ] **Step 3: Implement**

Add to `src/db.ts`:

```typescript
export function deleteRegisteredGroup(jid: string): void {
  const db = getDb();
  db.prepare('DELETE FROM registered_groups WHERE jid = ?').run(jid);
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/db.test.ts -t "deleteRegisteredGroup"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add deleteRegisteredGroup to DB module"
```

---

### Task 4: Todo Workers Get Sky-Level Mounts

**Files:**
- Modify: `src/container-runner.ts:64-200` (buildVolumeMounts)
- Modify: `src/container-runner-mounts.test.ts`

Todo workers need Sky's mounts (project root read-only, store, ToME, SSH, Gmail, MC) but are NOT `isMain`. Add `isTodoWorkerFolder` check to `buildVolumeMounts`.

- [ ] **Step 1: Write failing test**

Add to `src/container-runner-mounts.test.ts`:

```typescript
it('todo worker gets Sky-level mounts but is not isMain', () => {
  const group: RegisteredGroup = {
    name: 'Worker: test',
    folder: 'worker:todo-abc',
    trigger: '@Sky',
    added_at: '2026-01-01',
    requiresTrigger: false,
  };

  const mounts = buildVolumeMounts(group, false);

  // Should have project root (read-only) like main
  const projectMount = mounts.find((m) => m.containerPath === '/workspace/project');
  expect(projectMount).toBeDefined();
  expect(projectMount!.readonly).toBe(true);

  // Should have store access like main
  const storeMount = mounts.find((m) => m.containerPath === '/workspace/project/store');
  expect(storeMount).toBeDefined();

  // Should have its own group folder (not main's)
  const groupMount = mounts.find((m) => m.containerPath === '/workspace/group');
  expect(groupMount).toBeDefined();
  expect(groupMount!.hostPath).toContain('worker:todo-abc');

  // Should have ToME
  const tomeMount = mounts.find((m) => m.containerPath === '/workspace/global/tome');
  expect(tomeMount).toBeDefined();
});

it('regular non-main group does NOT get project root', () => {
  const group: RegisteredGroup = {
    name: 'Family Chat',
    folder: 'whatsapp_family',
    trigger: '@Sky',
    added_at: '2026-01-01',
  };

  const mounts = buildVolumeMounts(group, false);

  const projectMount = mounts.find((m) => m.containerPath === '/workspace/project');
  expect(projectMount).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/container-runner-mounts.test.ts -t "todo worker"`
Expected: FAIL — todo worker doesn't get project root yet

- [ ] **Step 3: Implement**

In `src/container-runner.ts`, update `buildVolumeMounts`:

```typescript
import { isTodoWorkerFolder } from './worker.js';

export function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);
  const isTodoWorker = isTodoWorkerFolder(group.folder);

  // Main AND todo workers get elevated mounts
  if (isMain || isTodoWorker) {
    // Project root read-only
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // Shadow .env
    const envFile = path.join(projectRoot, '.env');
    if (fs.existsSync(envFile)) {
      mounts.push({
        hostPath: '/dev/null',
        containerPath: '/workspace/project/.env',
        readonly: true,
      });
    }

    // Writable store access
    const storeDir = path.join(projectRoot, 'store');
    mounts.push({
      hostPath: storeDir,
      containerPath: '/workspace/project/store',
      readonly: false,
    });

    // Group folder
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // ToME
    if (fs.existsSync(TOME_DIR)) {
      mounts.push({
        hostPath: TOME_DIR,
        containerPath: '/workspace/global/tome',
        readonly: false,
      });
    }
  } else {
    // Regular non-main groups — existing behavior (unchanged)
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }

    if (fs.existsSync(TOME_DIR)) {
      mounts.push({
        hostPath: TOME_DIR,
        containerPath: '/workspace/global/tome',
        readonly: false,
      });
    }
  }

  // Shared mounts (MC, Gmail, SSH) — same for main and todo workers
  // ... (keep the existing MC, Gmail, SSH mount blocks — they already apply to all groups)
```

The key change: the `if (isMain)` branch becomes `if (isMain || isTodoWorker)`. The existing shared mounts (MC, Gmail, SSH, sessions) that follow the main/non-main block already apply to all groups, so no change needed there.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/container-runner-mounts.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/container-runner.ts src/container-runner-mounts.test.ts
git commit -m "feat: todo workers get Sky-level mounts"
```

---

### Task 5: Handle Worker Groups in processGroupMessages

**Files:**
- Modify: `src/index.ts:203-339` and `src/index.ts:509-610`

Workers don't have a channel. Skip typing indicators and channel output for todo worker JIDs.

- [ ] **Step 1: Add import**

At top of `src/index.ts`:

```typescript
import { isWorkerJid } from './worker.js';
```

- [ ] **Step 2: Update processGroupMessages**

Replace the function body with the version that handles channelless workers. Key changes:
- `if (!channel && !isWorkerJid(chatJid))` instead of `if (!channel)`
- Skip trigger check for workers (`!isWorker`)
- Guard all `channel.` calls with `if (channel)`
- Guard `channel.sendMessage` output with `if (text && channel)`

See full replacement in the Architecture section above. The diff is:
1. Line ~208: `const isWorker = isWorkerJid(chatJid);` + channel fallback
2. Line ~225: Skip trigger check for workers
3. Line ~265-272: Conditional typing indicator
4. Line ~289-301: Only send output to channel if channel exists

- [ ] **Step 3: Update startMessageLoop**

In the `messagesByGroup` loop (~line 549):
- Change `if (!channel)` to `if (!channel && !isWorkerJid(chatJid))`
- Guard typing indicator with `if (channel)`

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: support channelless todo workers in message processing"
```

---

### Task 6: Worker API Endpoints

**Files:**
- Modify: `src/api.ts`
- Modify: `src/api.test.ts`

Add `POST /api/workers` (create worker + inject assignment) and `DELETE /api/workers/:todoId` (destroy worker + soft-delete to trash).

- [ ] **Step 1: Write failing tests**

Add to `src/api.test.ts` mocks:

```typescript
const mockCreateWorker = vi.fn();
const mockDestroyWorker = vi.fn();
vi.mock('./worker.js', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
  destroyWorker: (...args: unknown[]) => mockDestroyWorker(...args),
  workerJid: (id: string) => `worker:todo-${id}@nanoclaw`,
  workerFolder: (id: string) => `worker:todo-${id}`,
  isWorkerJid: (jid: string) => jid.startsWith('worker:todo-') && jid.endsWith('@nanoclaw'),
  isTodoWorkerFolder: (folder: string) => folder.startsWith('worker:todo-'),
}));
```

Add test cases:

```typescript
describe('POST /api/workers', () => {
  it('creates worker and returns JID', async () => {
    mockCreateWorker.mockReturnValue({
      name: 'Worker: Test task',
      folder: 'worker:todo-abc123',
      trigger: '@Sky',
      added_at: '2026-04-05T00:00:00Z',
      requiresTrigger: false,
    });
    mockGroups['worker:todo-abc123@nanoclaw'] = {
      name: 'Worker: Test task',
      folder: 'worker:todo-abc123',
      trigger: '@Sky',
      added_at: '2026-04-05T00:00:00Z',
      requiresTrigger: false,
    };

    const res = await request('POST', '/api/workers', {
      todoId: 'abc123',
      title: 'Test task',
      description: 'Do something',
    });
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.workerJid).toBe('worker:todo-abc123@nanoclaw');

    delete mockGroups['worker:todo-abc123@nanoclaw'];
  });

  it('returns 400 if todoId missing', async () => {
    const res = await request('POST', '/api/workers', { title: 'No ID' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/workers/:todoId', () => {
  it('destroys worker', async () => {
    const res = await request('DELETE', '/api/workers/abc123');
    expect(res.status).toBe(200);
    expect(mockDestroyWorker).toHaveBeenCalledWith('abc123');
  });
});
```

- [ ] **Step 2: Implement endpoints**

Add to `src/api.ts`:

```typescript
import { createWorker, destroyWorker, workerJid } from './worker.js';
```

Add handlers and routes (see Task 4 in original plan for full code). Key: `handlePostWorker` calls `createWorker`, injects assignment message via `storeMessage`, returns JID. `handleDeleteWorker` calls `destroyWorker`.

Wire `setWorkerCallbacks` so in-memory `registeredGroups` stays in sync (see Task 5 original plan).

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/api.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/api.ts src/api.test.ts
git commit -m "feat: add POST/DELETE /api/workers endpoints"
```

---

### Task 7: Wire In-Memory Registration in index.ts

**Files:**
- Modify: `src/index.ts`
- Modify: `src/api.ts`

The API writes to SQLite but the message loop reads from in-memory `registeredGroups`. Add callbacks so worker creation/deletion updates both.

- [ ] **Step 1: Add setWorkerCallbacks export to api.ts**

```typescript
let onWorkerCreatedFn: ((jid: string, group: RegisteredGroup) => void) | null = null;
let onWorkerDestroyedFn: ((jid: string) => void) | null = null;

export function setWorkerCallbacks(
  onCreate: (jid: string, group: RegisteredGroup) => void,
  onDestroy: (jid: string) => void,
): void {
  onWorkerCreatedFn = onCreate;
  onWorkerDestroyedFn = onDestroy;
}
```

Call `onWorkerCreatedFn` in `handlePostWorker` after `createWorker`, and `onWorkerDestroyedFn` in `handleDeleteWorker`.

- [ ] **Step 2: Wire callbacks in index.ts main()**

After `startApiServer`:

```typescript
import { setWorkerCallbacks } from './api.js';

setWorkerCallbacks(
  (jid, group) => { registeredGroups[jid] = group; },
  (jid) => { delete registeredGroups[jid]; },
);
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/api.ts src/index.ts
git commit -m "feat: wire worker callbacks for in-memory group registration"
```

---

### Task 8: Update Mission Control — Assignment and Cleanup

**Files:**
- Modify: `MC: src/server/routes/todos.ts`

On assignment: call `POST /api/workers`. On completion/cancellation: call `DELETE /api/workers/:todoId`. Feedback already works (routes to worker JID via ownerFolder).

- [ ] **Step 1: Replace assignment block in PUT /api/todos/:id**

Replace the existing block (line ~343) that injects into the main group:

```typescript
// Assign todo to agent — create a dedicated worker container
if (owner && owner !== 'human' && existing.owner === 'human') {
  const apiKey = process.env.NANOCLAW_API_KEY;
  if (apiKey) {
    const payload = JSON.stringify({
      todoId: updated.id,
      title: updated.title,
      description: updated.description || undefined,
    });
    const workerReq = http.request(
      {
        hostname: 'localhost',
        port: 3004,
        path: '/api/workers',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (workerRes) => {
        const chunks: Buffer[] = [];
        workerRes.on('data', (c) => chunks.push(c));
        workerRes.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString());
            if (result.ok) {
              // Update owner to worker folder so feedback routes correctly
              db.prepare(
                `UPDATE todos SET owner = ?, updated_at = datetime('now') WHERE id = ?`,
              ).run(result.workerFolder, updated.id);
            }
          } catch { /* ignore */ }
        });
      },
    );
    workerReq.on('error', () => {});
    workerReq.write(payload);
    workerReq.end();
  }
}
```

- [ ] **Step 2: Add cleanup on completion/cancellation**

Add before the assignment block:

```typescript
// Clean up worker when todo is completed or cancelled
const isTerminal = (status === 'completed' || status === 'cancelled') &&
  existing.status !== 'completed' && existing.status !== 'cancelled';
const hasWorker = existing.owner.startsWith('worker:todo-');

if (isTerminal && hasWorker) {
  const apiKey = process.env.NANOCLAW_API_KEY;
  if (apiKey) {
    const todoIdFromOwner = existing.owner.replace('worker:todo-', '');
    const deleteReq = http.request(
      {
        hostname: 'localhost',
        port: 3004,
        path: `/api/workers/${encodeURIComponent(todoIdFromOwner)}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      () => {},
    );
    deleteReq.on('error', () => {});
    deleteReq.end();
  }
}
```

- [ ] **Step 3: Verify MC builds**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/server/routes/todos.ts
git commit -m "feat: use worker containers for todo assignment, cleanup on completion"
```

---

### Task 9: Integration Test

**Files:**
- Create: `src/worker-integration.test.ts`

Full lifecycle: create worker via API, verify group + folder + message, then destroy and verify trash.

- [ ] **Step 1: Write and run integration test**

(See original plan Task 7 for test code, updated to verify trash behavior instead of folder preservation)

- [ ] **Step 2: Commit**

```bash
git add src/worker-integration.test.ts
git commit -m "test: add worker API integration test"
```

---

### Task 10: Update CUSTOMIZATIONS.md

**Files:**
- Modify: `CUSTOMIZATIONS.md`

- [ ] **Step 1: Document the change**

```markdown
## Todo-Scoped Worker Containers (2026-04-05)

**What:** Todo assignment now spawns isolated worker containers (`worker:todo-{id}`) instead of injecting into the main agent's session. Multiple todos run in parallel (up to 15 concurrent containers).

**Why:** Parallel execution without context-switching. Each worker gets its own session, CLAUDE.md (from Sky's template + todo context), and Sky-level mounts.

**Files changed:**
- `src/worker.ts` — Worker lifecycle (create, soft-delete to trash, HITL cleanup)
- `src/config.ts` — MAX_CONCURRENT_CONTAINERS raised to 15
- `src/container-runner.ts` — Todo workers get Sky-level mounts
- `src/api.ts` — POST/DELETE /api/workers endpoints
- `src/index.ts` — processGroupMessages handles channelless workers
- `MC: src/server/routes/todos.ts` — Assignment/feedback/cleanup routes to workers

**Design decisions:**
- Only `worker:todo-*` groups get Sky replication. Existing specialist workers unchanged.
- Workers communicate via IPC send_message and MCP todo tools (no channel).
- Soft-delete to data/trash/ on completion. Weekly HITL cleanup prompt (no auto-purge).
- CLAUDE.md generated once at assignment time (session context carries through feedback rounds).
```

- [ ] **Step 2: Commit**

```bash
git add CUSTOMIZATIONS.md
git commit -m "docs: document todo-scoped worker containers"
```

---

## Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| `worker:todo-*` scoping | Only todo workers get Sky replication. Specialist workers (`worker:llm-*`) keep existing behavior. |
| Channelless processing | Workers don't need Telegram/WhatsApp. They talk back via IPC and MCP tools. |
| Sky-level mounts, not isMain | Workers need the tools but not IPC privileges (no group registration, no delegation). |
| Soft-delete to trash | Safe cleanup. Weekly HITL prompt lists old entries, you confirm before purge. |
| Path safety checks | `destroyWorker` validates folder prefix + path resolution before any move/delete. |
| CLAUDE.md generated once | Session context carries forward through feedback rounds. No regeneration needed. |
| MAX_CONCURRENT_CONTAINERS = 15 | Supports parallel todo execution at scale. |
