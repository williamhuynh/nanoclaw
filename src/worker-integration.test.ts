import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted above all other statements, so they
// cannot reference module-scope variables directly. We use deferred getters
// on globalThis (same pattern as worker.test.ts) to bridge the gap.
// ---------------------------------------------------------------------------

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({ NANOCLAW_API_KEY: 'test-key' })),
}));

vi.mock('./config.js', () => ({
  get DATA_DIR() {
    return (globalThis as Record<string, unknown>).__WI_DATA_DIR as string;
  },
  get GROUPS_DIR() {
    return (globalThis as Record<string, unknown>).__WI_GROUPS_DIR as string;
  },
  ASSISTANT_NAME: 'Sky',
  DEFAULT_TRIGGER: '@Sky',
}));

vi.mock('./group-folder.js', () => ({
  isValidGroupFolder: vi.fn(() => true),
  resolveGroupFolderPath: (folder: string) => {
    const _path = require('path');
    const _groupsDir = (globalThis as Record<string, unknown>).__WI_GROUPS_DIR as string;
    return _path.join(_groupsDir, folder);
  },
  resolveGroupIpcPath: (folder: string) => {
    const _path = require('path');
    const _dataDir = (globalThis as Record<string, unknown>).__WI_DATA_DIR as string;
    return _path.join(_dataDir, 'ipc', folder);
  },
}));

// ---------------------------------------------------------------------------
// Mock db.js with in-memory stores
// ---------------------------------------------------------------------------

const mockMessages: Array<Record<string, unknown>> = [];
const mockGroups: Record<string, Record<string, unknown>> = {
  'main@nanoclaw': {
    name: 'Main',
    folder: 'main',
    trigger: '@Sky',
    added_at: '2026-01-01',
    isMain: true,
  },
};

vi.mock('./db.js', () => ({
  getAllRegisteredGroups: vi.fn(() => ({ ...mockGroups })),
  setRegisteredGroup: vi.fn((jid: string, group: Record<string, unknown>) => {
    mockGroups[jid] = group;
  }),
  deleteRegisteredGroup: vi.fn((jid: string) => {
    delete mockGroups[jid];
  }),
  deleteSession: vi.fn(),
  getAllChats: vi.fn(() => []),
  getAllTasks: vi.fn(() => []),
  getMessagesSince: vi.fn(() => []),
  storeMessage: vi.fn((msg: Record<string, unknown>) => mockMessages.push(msg)),
  getTaskById: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Build temp paths and store on globalThis (runs before module imports)
// ---------------------------------------------------------------------------

const tmpDir = path.join(os.tmpdir(), `nanoclaw-worker-integ-${Date.now()}`);
const dataDir = path.join(tmpDir, 'data');
const groupsDir = path.join(tmpDir, 'groups');
(globalThis as Record<string, unknown>).__WI_DATA_DIR = dataDir;
(globalThis as Record<string, unknown>).__WI_GROUPS_DIR = groupsDir;

// ---------------------------------------------------------------------------
// Import the modules under test (AFTER mocks are set up)
// ---------------------------------------------------------------------------

import { startApiServer, setWorkerCallbacks } from './api.js';

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------

function request(
  method: string,
  urlPath: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: urlPath,
        method,
        headers: {
          Authorization: 'Bearer test-key',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;

describe('Worker API integration', () => {
  beforeAll(async () => {
    // Clear NANOCLAW_API_KEY from process.env so the mock readEnvFile is used
    delete process.env.NANOCLAW_API_KEY;

    // Create main group template
    fs.mkdirSync(path.join(groupsDir, 'main'), { recursive: true });
    fs.writeFileSync(
      path.join(groupsDir, 'main', 'CLAUDE.md'),
      '# Sky\n\nYou are Sky, a personal assistant.\n',
    );
    fs.mkdirSync(dataDir, { recursive: true });

    setWorkerCallbacks(
      (jid, group) => {
        mockGroups[jid] = group;
      },
      (jid) => {
        delete mockGroups[jid];
      },
    );

    server = await startApiServer(0, '127.0.0.1');
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a worker, verifies folder and message, then destroys to trash', async () => {
    // Create worker
    const createRes = await request('POST', '/api/workers', {
      todoId: 'integ-1',
      title: 'Integration test task',
      description: 'Verify full lifecycle',
    });
    expect(createRes.status).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.ok).toBe(true);
    expect(created.workerJid).toBe('worker:todo-integ-1@nanoclaw');
    expect(created.workerFolder).toBe('worker:todo-integ-1');

    // Verify group folder created
    const workerDir = path.join(groupsDir, 'worker:todo-integ-1');
    expect(fs.existsSync(workerDir)).toBe(true);
    expect(fs.existsSync(path.join(workerDir, 'CLAUDE.md'))).toBe(true);

    // Verify CLAUDE.md has todo context
    const md = fs.readFileSync(path.join(workerDir, 'CLAUDE.md'), 'utf-8');
    expect(md).toContain('Integration test task');
    expect(md).toContain('integ-1');

    // Verify message was injected
    const injected = mockMessages.find(
      (m) => m.chat_jid === 'worker:todo-integ-1@nanoclaw',
    );
    expect(injected).toBeDefined();
    expect(injected!.content).toContain('Integration test task');

    // Verify in-memory registration
    expect(mockGroups['worker:todo-integ-1@nanoclaw']).toBeDefined();

    // Destroy worker
    const deleteRes = await request('DELETE', '/api/workers/integ-1');
    expect(deleteRes.status).toBe(200);
    expect(JSON.parse(deleteRes.body).ok).toBe(true);

    // Verify folder moved to trash (not in groups/ anymore)
    expect(fs.existsSync(workerDir)).toBe(false);

    // Verify trash has the entry
    const trashDir = path.join(dataDir, 'trash');
    expect(fs.existsSync(trashDir)).toBe(true);
    const trashEntries = fs.readdirSync(trashDir);
    const workerTrash = trashEntries.find((e) =>
      e.startsWith('worker:todo-integ-1--'),
    );
    expect(workerTrash).toBeDefined();

    // Verify in-memory deregistration
    expect(mockGroups['worker:todo-integ-1@nanoclaw']).toBeUndefined();
  });
});
