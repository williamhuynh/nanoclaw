import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config before importing worker module
vi.mock('./config.js', () => {
  // Deferred — tmpBase is set in beforeEach via setTmpDirs
  return {
    get DATA_DIR() {
      return (globalThis as Record<string, unknown>).__TEST_DATA_DIR as string;
    },
    get GROUPS_DIR() {
      return (globalThis as Record<string, unknown>).__TEST_GROUPS_DIR as string;
    },
    ASSISTANT_NAME: 'Sky',
    DEFAULT_TRIGGER: '@Sky',
  };
});

vi.mock('./db.js', () => ({
  setRegisteredGroup: vi.fn(),
  deleteRegisteredGroup: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  setRegisteredGroup,
  deleteRegisteredGroup,
  deleteSession,
} from './db.js';
import { logger } from './logger.js';
import {
  workerJid,
  workerFolder,
  isWorkerJid,
  isTodoWorkerFolder,
  generateWorkerClaudeMd,
  createWorker,
  destroyWorker,
  listTrash,
  purgeTrash,
  type TodoContext,
} from './worker.js';

let tmpBase: string;

function setTmpDirs(base: string) {
  (globalThis as Record<string, unknown>).__TEST_DATA_DIR = path.join(
    base,
    'data',
  );
  (globalThis as Record<string, unknown>).__TEST_GROUPS_DIR = path.join(
    base,
    'groups',
  );
}

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-test-'));
  setTmpDirs(tmpBase);
  fs.mkdirSync(path.join(tmpBase, 'data'), { recursive: true });
  fs.mkdirSync(path.join(tmpBase, 'groups'), { recursive: true });
  vi.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

describe('naming helpers', () => {
  it('workerJid returns worker:todo-{id}@nanoclaw', () => {
    expect(workerJid('abc-123')).toBe('worker:todo-abc-123@nanoclaw');
  });

  it('workerFolder returns worker:todo-{id}', () => {
    expect(workerFolder('abc-123')).toBe('worker:todo-abc-123');
  });

  it('isWorkerJid returns true for worker:todo-* JIDs', () => {
    expect(isWorkerJid('worker:todo-abc@nanoclaw')).toBe(true);
    expect(isWorkerJid('worker:todo-123@nanoclaw')).toBe(true);
  });

  it('isWorkerJid returns false for non-todo worker JIDs', () => {
    expect(isWorkerJid('worker:llm-specialist@nanoclaw')).toBe(false);
    expect(isWorkerJid('group@g.us')).toBe(false);
    expect(isWorkerJid('')).toBe(false);
  });

  it('isTodoWorkerFolder returns true for worker:todo-* folders', () => {
    expect(isTodoWorkerFolder('worker:todo-abc')).toBe(true);
    expect(isTodoWorkerFolder('worker:todo-123')).toBe(true);
  });

  it('isTodoWorkerFolder returns false for other folders', () => {
    expect(isTodoWorkerFolder('worker:llm-specialist')).toBe(false);
    expect(isTodoWorkerFolder('main')).toBe(false);
    expect(isTodoWorkerFolder('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateWorkerClaudeMd
// ---------------------------------------------------------------------------

describe('generateWorkerClaudeMd', () => {
  const ctx: TodoContext = {
    todoId: 'todo-42',
    title: 'Fix the login bug',
    description: 'Users cannot log in with SSO',
  };

  it('replaces the Sky header with Worker header', () => {
    const base = '# Sky\n\nSome instructions here.\n';
    const result = generateWorkerClaudeMd(base, ctx);
    expect(result).toContain('# Sky — Worker');
    expect(result).not.toMatch(/^# Sky\n/m);
  });

  it('includes the todo title and id', () => {
    const base = '# Sky\n\nInstructions.\n';
    const result = generateWorkerClaudeMd(base, ctx);
    expect(result).toContain('todo-42');
    expect(result).toContain('Fix the login bug');
  });

  it('includes the description when provided', () => {
    const base = '# Sky\n\nInstructions.\n';
    const result = generateWorkerClaudeMd(base, ctx);
    expect(result).toContain('Users cannot log in with SSO');
  });

  it('handles missing description gracefully', () => {
    const base = '# Sky\n\nInstructions.\n';
    const ctxNoDesc: TodoContext = { todoId: 'todo-99', title: 'Do stuff' };
    const result = generateWorkerClaudeMd(base, ctxNoDesc);
    expect(result).toContain('todo-99');
    expect(result).toContain('Do stuff');
    // Should not have a stale "Description:" line with undefined
    expect(result).not.toContain('undefined');
  });

  it('includes workflow instructions', () => {
    const base = '# Sky\n\nInstructions.\n';
    const result = generateWorkerClaudeMd(base, ctx);
    // Should have some workflow guidance
    expect(result.toLowerCase()).toMatch(/workflow|complete|done|finish/);
  });
});

// ---------------------------------------------------------------------------
// createWorker
// ---------------------------------------------------------------------------

describe('createWorker', () => {
  it('creates group folder with CLAUDE.md and calls setRegisteredGroup', async () => {
    const dataDir = path.join(tmpBase, 'data');
    const groupsDir = path.join(tmpBase, 'groups');

    // Create the main group folder with a CLAUDE.md
    const mainFolder = 'main';
    fs.mkdirSync(path.join(groupsDir, mainFolder), { recursive: true });
    fs.writeFileSync(
      path.join(groupsDir, mainFolder, 'CLAUDE.md'),
      '# Sky\n\nMain instructions.\n',
    );

    const result = await createWorker({
      todoId: 'abc-123',
      title: 'Test task',
      description: 'A test description',
      mainGroupFolder: mainFolder,
    });

    // Folder was created
    const expectedFolder = 'worker:todo-abc-123';
    const folderPath = path.join(groupsDir, expectedFolder);
    expect(fs.existsSync(folderPath)).toBe(true);

    // CLAUDE.md was written
    const claudeMd = fs.readFileSync(
      path.join(folderPath, 'CLAUDE.md'),
      'utf-8',
    );
    expect(claudeMd).toContain('# Sky — Worker');
    expect(claudeMd).toContain('Test task');

    // logs/ dir was created
    expect(fs.existsSync(path.join(folderPath, 'logs'))).toBe(true);

    // DB registration was called
    expect(setRegisteredGroup).toHaveBeenCalledWith(
      'worker:todo-abc-123@nanoclaw',
      expect.objectContaining({
        name: expect.stringContaining('Test task'),
        folder: expectedFolder,
        requiresTrigger: false,
      }),
    );

    // isMain should NOT be set
    const callArgs = (setRegisteredGroup as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(callArgs.isMain).toBeUndefined();

    // Return value
    expect(result.folder).toBe(expectedFolder);
    expect(result.requiresTrigger).toBe(false);
  });

  it('falls back to minimal template when main CLAUDE.md is missing', async () => {
    const groupsDir = path.join(tmpBase, 'groups');

    const result = await createWorker({
      todoId: 'no-base',
      title: 'Fallback test',
      mainGroupFolder: 'nonexistent',
    });

    const claudeMd = fs.readFileSync(
      path.join(groupsDir, result.folder, 'CLAUDE.md'),
      'utf-8',
    );
    expect(claudeMd).toContain('# Sky — Worker');
    expect(claudeMd).toContain('Fallback test');
  });
});

// ---------------------------------------------------------------------------
// destroyWorker
// ---------------------------------------------------------------------------

describe('destroyWorker', () => {
  it('moves group and session folders to trash', async () => {
    const dataDir = path.join(tmpBase, 'data');
    const groupsDir = path.join(tmpBase, 'groups');
    const folder = 'worker:todo-destroy-1';

    // Create group folder
    fs.mkdirSync(path.join(groupsDir, folder), { recursive: true });
    fs.writeFileSync(
      path.join(groupsDir, folder, 'CLAUDE.md'),
      'test content',
    );

    // Create session folder
    fs.mkdirSync(path.join(dataDir, 'sessions', folder), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'sessions', folder, 'session.json'),
      '{}',
    );

    // Create IPC input dir for _close sentinel
    fs.mkdirSync(path.join(dataDir, 'ipc', folder, 'input'), {
      recursive: true,
    });

    await destroyWorker('destroy-1');

    // DB calls
    expect(deleteRegisteredGroup).toHaveBeenCalledWith(
      'worker:todo-destroy-1@nanoclaw',
    );
    expect(deleteSession).toHaveBeenCalledWith(folder);

    // _close sentinel written
    const ipcInputDir = path.join(dataDir, 'ipc', folder, 'input');
    const sentinelFiles = fs.readdirSync(ipcInputDir);
    expect(sentinelFiles.some((f) => f === '_close')).toBe(true);

    // Group folder moved to trash
    expect(fs.existsSync(path.join(groupsDir, folder))).toBe(false);
    const trashDir = path.join(dataDir, 'trash');
    expect(fs.existsSync(trashDir)).toBe(true);
    const trashEntries = fs.readdirSync(trashDir);
    expect(trashEntries.some((e) => e.startsWith('worker:todo-destroy-1--'))).toBe(
      true,
    );
  });

  it('blocks path traversal attempts', async () => {
    // Try to destroy with a malicious todo ID that could cause traversal
    await destroyWorker('../../etc');

    // Should NOT have called deleteRegisteredGroup
    expect(deleteRegisteredGroup).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();

    // Logger should have been called with an error
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles missing group folder gracefully', async () => {
    const dataDir = path.join(tmpBase, 'data');

    // Create IPC dir so sentinel can be written
    const folder = 'worker:todo-missing';
    fs.mkdirSync(path.join(dataDir, 'ipc', folder, 'input'), {
      recursive: true,
    });

    // Should not throw even if group folder does not exist
    await destroyWorker('missing');

    // DB calls should still happen
    expect(deleteRegisteredGroup).toHaveBeenCalledWith(
      'worker:todo-missing@nanoclaw',
    );
    expect(deleteSession).toHaveBeenCalledWith(folder);
  });
});

// ---------------------------------------------------------------------------
// listTrash
// ---------------------------------------------------------------------------

describe('listTrash', () => {
  it('returns entries older than minAgeDays', () => {
    const trashDir = path.join(tmpBase, 'data', 'trash');
    fs.mkdirSync(trashDir, { recursive: true });

    // Create an entry 10 days old
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    const oldName = `worker:todo-old--${tenDaysAgo.toISOString().replace(/[:.]/g, '-')}`;
    fs.mkdirSync(path.join(trashDir, oldName));

    // Create a recent entry (now)
    const recentName = `worker:todo-new--${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.mkdirSync(path.join(trashDir, recentName));

    const entries = listTrash(7);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe(oldName);
    expect(entries[0].ageDays).toBeGreaterThanOrEqual(9);
  });

  it('returns empty when trash dir does not exist', () => {
    const entries = listTrash(0);
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// purgeTrash
// ---------------------------------------------------------------------------

describe('purgeTrash', () => {
  it('permanently deletes specified trash entries', () => {
    const trashDir = path.join(tmpBase, 'data', 'trash');
    fs.mkdirSync(trashDir, { recursive: true });

    const entryName = `worker:todo-purge--${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const entryPath = path.join(trashDir, entryName);
    fs.mkdirSync(entryPath);
    fs.writeFileSync(path.join(entryPath, 'test.txt'), 'data');

    purgeTrash([entryPath]);

    expect(fs.existsSync(entryPath)).toBe(false);
  });

  it('refuses to delete paths outside trash directory', () => {
    const outsidePath = path.join(tmpBase, 'groups', 'main');
    fs.mkdirSync(outsidePath, { recursive: true });
    fs.writeFileSync(path.join(outsidePath, 'CLAUDE.md'), 'keep this');

    purgeTrash([outsidePath]);

    // Should NOT have deleted it
    expect(fs.existsSync(outsidePath)).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});
