import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockEnv: Record<string, string> = { NANOCLAW_API_KEY: 'test-key-123' };
vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({ ...mockEnv })),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nanoclaw-test-api' }));
vi.mock('./group-folder.js', () => ({
  isValidGroupFolder: vi.fn(() => true),
}));

const mockGroups: Record<
  string,
  {
    name: string;
    folder: string;
    trigger: string;
    added_at: string;
    isMain?: boolean;
    requiresTrigger?: boolean;
  }
> = {
  'group-jid-1@g.us': {
    name: 'Test Group',
    folder: 'test-group',
    trigger: '!bot',
    added_at: '2024-01-01T00:00:00Z',
    isMain: true,
    requiresTrigger: false,
  },
  'group-jid-2@g.us': {
    name: 'Second Group',
    folder: 'second-group',
    trigger: '!bot',
    added_at: '2024-01-02T00:00:00Z',
    isMain: false,
    requiresTrigger: true,
  },
};

const mockTasks = [
  {
    id: 'task-1',
    group_folder: 'test-group',
    chat_jid: 'group-jid-1@g.us',
    prompt: 'Daily summary',
    schedule_type: 'cron',
    schedule_value: '0 9 * * *',
    context_mode: 'isolated',
    next_run: '2024-01-02T09:00:00Z',
    last_run: null,
    last_result: null,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    group_folder: 'test-group',
    chat_jid: 'group-jid-1@g.us',
    prompt: 'Weekly check',
    schedule_type: 'cron',
    schedule_value: '0 10 * * 1',
    context_mode: 'group',
    next_run: '2024-01-08T10:00:00Z',
    last_run: null,
    last_result: null,
    status: 'paused',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockChats = [
  {
    jid: 'group-jid-1@g.us',
    name: 'Test Group',
    last_message_time: '2024-01-01',
    channel: 'whatsapp',
    is_group: 1,
  },
  {
    jid: 'user-1@s.whatsapp.net',
    name: 'Alice',
    last_message_time: '2024-01-01',
    channel: 'whatsapp',
    is_group: 0,
  },
];

const mockMessages = [
  {
    id: 'msg-1',
    chat_jid: 'group-jid-1@g.us',
    sender: 'user-1',
    sender_name: 'Alice',
    content: 'Hello',
    timestamp: '2024-01-01T00:00:00Z',
    is_from_me: 0,
    is_bot_message: 0,
  },
];

const mockStoreMessage = vi.fn();
const mockGetTaskById = vi.fn();

vi.mock('./db.js', () => ({
  getAllRegisteredGroups: vi.fn(() => ({ ...mockGroups })),
  getAllTasks: vi.fn(() => [...mockTasks]),
  getAllChats: vi.fn(() => [...mockChats]),
  getMessagesSince: vi.fn(() => [...mockMessages]),
  storeMessage: (...args: unknown[]) => mockStoreMessage(...args),
  getTaskById: (...args: unknown[]) => mockGetTaskById(...args),
}));

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

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
    },
  };
});

import { startApiServer } from './api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  port: number,
  options: http.RequestOptions,
  body = '',
): Promise<{
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { ...options, hostname: '127.0.0.1', port },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function authedGet(port: number, path: string) {
  return makeRequest(port, {
    method: 'GET',
    path,
    headers: { authorization: 'Bearer test-key-123' },
  });
}

function authedPost(port: number, path: string, data: unknown) {
  const body = JSON.stringify(data);
  return makeRequest(
    port,
    {
      method: 'POST',
      path,
      headers: {
        authorization: 'Bearer test-key-123',
        'content-type': 'application/json',
      },
    },
    body,
  );
}

function authedPatch(port: number, path: string, data: unknown) {
  const body = JSON.stringify(data);
  return makeRequest(
    port,
    {
      method: 'PATCH',
      path,
      headers: {
        authorization: 'Bearer test-key-123',
        'content-type': 'application/json',
      },
    },
    body,
  );
}

function authedDelete(port: number, path: string) {
  return makeRequest(port, {
    method: 'DELETE',
    path,
    headers: { authorization: 'Bearer test-key-123' },
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('API server', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // Clear NANOCLAW_API_KEY from process.env so the mock readEnvFile is used
    delete process.env.NANOCLAW_API_KEY;
    server = await startApiServer(0, '127.0.0.1');
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(() => {
    mockCreateWorker.mockReset();
    mockDestroyWorker.mockReset();
    mockStoreMessage.mockReset();
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  describe('authentication', () => {
    it('rejects requests without Authorization header with 401', async () => {
      const res = await makeRequest(port, {
        method: 'GET',
        path: '/api/status',
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Unauthorized');
    });

    it('rejects requests with wrong token with 401', async () => {
      const res = await makeRequest(port, {
        method: 'GET',
        path: '/api/status',
        headers: { authorization: 'Bearer wrong-key' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('accepts requests with correct token', async () => {
      const res = await authedGet(port, '/api/status');
      expect(res.statusCode).toBe(200);
    });

    it('GET / returns status without auth (public endpoint)', async () => {
      const res = await makeRequest(port, { method: 'GET', path: '/' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('NanoClaw API');
      expect(body.status).toBe('online');
    });
  });

  // -----------------------------------------------------------------------
  // GET endpoints
  // -----------------------------------------------------------------------
  describe('GET endpoints', () => {
    it('GET /api/status returns system status', async () => {
      const res = await authedGet(port, '/api/status');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(typeof body.uptime).toBe('number');
      expect(body.groups).toBe(2);
      expect(body.activeTasks).toBe(1);
      expect(body.totalTasks).toBe(2);
    });

    it('GET /api/groups returns array of groups', async () => {
      const res = await authedGet(port, '/api/groups');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      const main = body.find((g: { isMain: boolean }) => g.isMain);
      expect(main).toBeDefined();
      expect(main.jid).toBe('group-jid-1@g.us');
      expect(main.name).toBe('Test Group');
      expect(main.folder).toBe('test-group');
    });

    it('GET /api/tasks returns array of tasks', async () => {
      const res = await authedGet(port, '/api/tasks');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      expect(body[0].id).toBe('task-1');
    });

    it('GET /api/chats returns array of chats', async () => {
      const res = await authedGet(port, '/api/chats');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      expect(body[0].jid).toBe('group-jid-1@g.us');
    });

    it('GET /api/messages/:jid returns messages for a known JID', async () => {
      const res = await authedGet(port, '/api/messages/group-jid-1@g.us');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);
      expect(body[0].id).toBe('msg-1');
    });

    it('GET /api/messages/:jid returns 404 for unknown JID', async () => {
      const res = await authedGet(port, '/api/messages/unknown-jid@g.us');
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Group not found');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/message
  // -----------------------------------------------------------------------
  describe('POST /api/message', () => {
    it('returns 202 and writes IPC file', async () => {
      const res = await authedPost(port, '/api/message', {
        chatJid: 'group-jid-1@g.us',
        text: 'Hello from API',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.ipcFile).toBeDefined();
    });

    it('returns 400 when chatJid is missing', async () => {
      const res = await authedPost(port, '/api/message', { text: 'no jid' });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('chatJid');
    });

    it('returns 400 when text is missing', async () => {
      const res = await authedPost(port, '/api/message', {
        chatJid: 'group-jid-1@g.us',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('text');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/inject
  // -----------------------------------------------------------------------
  describe('POST /api/inject', () => {
    it('returns 202 and calls storeMessage', async () => {
      mockStoreMessage.mockClear();
      const res = await authedPost(port, '/api/inject', {
        chatJid: 'group-jid-1@g.us',
        text: 'Injected message',
        senderName: 'TestUser',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.messageId).toBeDefined();
      expect(mockStoreMessage).toHaveBeenCalledTimes(1);
      const storedMsg = mockStoreMessage.mock.calls[0][0];
      expect(storedMsg.content).toBe('Injected message');
      expect(storedMsg.sender_name).toBe('TestUser');
    });

    it('returns 400 when chatJid is missing', async () => {
      const res = await authedPost(port, '/api/inject', { text: 'no jid' });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('chatJid');
    });

    it('returns 400 when text is missing', async () => {
      const res = await authedPost(port, '/api/inject', {
        chatJid: 'group-jid-1@g.us',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for unknown JID', async () => {
      const res = await authedPost(port, '/api/inject', {
        chatJid: 'unknown-jid@g.us',
        text: 'some text',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Group not found');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/delegate
  // -----------------------------------------------------------------------
  describe('POST /api/delegate', () => {
    it('returns 202 and writes IPC task file', async () => {
      const res = await authedPost(port, '/api/delegate', {
        targetGroup: 'second-group',
        prompt: 'Do something',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.delegationId).toBeDefined();
    });

    it('returns 400 when targetGroup is missing', async () => {
      const res = await authedPost(port, '/api/delegate', {
        prompt: 'Do something',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('targetGroup');
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await authedPost(port, '/api/delegate', {
        targetGroup: 'second-group',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('prompt');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/tasks (schedule task)
  // -----------------------------------------------------------------------
  describe('POST /api/tasks', () => {
    it('returns 202 with taskId', async () => {
      const res = await authedPost(port, '/api/tasks', {
        prompt: 'Run daily',
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        targetJid: 'group-jid-1@g.us',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.taskId).toBeDefined();
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await authedPost(port, '/api/tasks', {
        prompt: 'Run daily',
        // missing scheduleType, scheduleValue, targetJid
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('required');
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await authedPost(port, '/api/tasks', {
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        targetJid: 'group-jid-1@g.us',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/tasks/:id
  // -----------------------------------------------------------------------
  describe('PATCH /api/tasks/:id', () => {
    it('returns 404 for unknown task', async () => {
      mockGetTaskById.mockReturnValue(undefined);
      const res = await authedPatch(port, '/api/tasks/nonexistent', {
        action: 'pause',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Task not found');
    });

    it('returns 202 for pause action on existing task', async () => {
      mockGetTaskById.mockReturnValue(mockTasks[0]);
      const res = await authedPatch(port, '/api/tasks/task-1', {
        action: 'pause',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.taskId).toBe('task-1');
    });

    it('returns 202 for resume action on existing task', async () => {
      mockGetTaskById.mockReturnValue(mockTasks[1]);
      const res = await authedPatch(port, '/api/tasks/task-2', {
        action: 'resume',
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });

    it('returns 202 for cancel action on existing task', async () => {
      mockGetTaskById.mockReturnValue(mockTasks[0]);
      const res = await authedPatch(port, '/api/tasks/task-1', {
        action: 'cancel',
      });
      expect(res.statusCode).toBe(202);
    });

    it('returns 202 for update action on existing task', async () => {
      mockGetTaskById.mockReturnValue(mockTasks[0]);
      const res = await authedPatch(port, '/api/tasks/task-1', {
        prompt: 'Updated prompt',
        scheduleValue: '0 10 * * *',
      });
      expect(res.statusCode).toBe(202);
    });
  });

  // -----------------------------------------------------------------------
  // CORS
  // -----------------------------------------------------------------------
  describe('CORS', () => {
    it('OPTIONS returns 204 with Access-Control headers', async () => {
      const res = await makeRequest(port, {
        method: 'OPTIONS',
        path: '/api/status',
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-methods']).toContain('PATCH');
      expect(res.headers['access-control-allow-headers']).toContain(
        'Authorization',
      );
    });

    it('authenticated responses include Access-Control-Allow-Origin header', async () => {
      const res = await authedGet(port, '/api/status');
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  // -----------------------------------------------------------------------
  // Todo proxy
  // -----------------------------------------------------------------------
  describe('todo proxy', () => {
    it('GET /api/todos proxies to Mission Control (502 if MC down, 200 if MC up)', async () => {
      const res = await authedGet(port, '/api/todos');
      // If Mission Control is running on port 3002, we get a proxied response;
      // if not, we get 502. Both are correct proxy behavior.
      expect([200, 502]).toContain(res.statusCode);
      const body = JSON.parse(res.body);
      if (res.statusCode === 502) {
        expect(body.error).toContain('Mission Control unavailable');
      }
    });

    it('POST /api/todos proxies to Mission Control (502 if MC down, 2xx if MC up)', async () => {
      const res = await authedPost(port, '/api/todos', { title: 'Test todo' });
      // Accept any 2xx from MC or 502 if MC is not running
      if (res.statusCode === 502) {
        const body = JSON.parse(res.body);
        expect(body.error).toContain('Mission Control unavailable');
      } else {
        expect(res.statusCode).toBeGreaterThanOrEqual(200);
        expect(res.statusCode).toBeLessThan(300);
      }
    });

    it('/api/todos requires authentication', async () => {
      const res = await makeRequest(port, {
        method: 'GET',
        path: '/api/todos',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/workers
  // -----------------------------------------------------------------------
  describe('POST /api/workers', () => {
    it('creates worker and returns JID', async () => {
      mockCreateWorker.mockReturnValue({
        name: 'Worker: Test task',
        folder: 'worker:todo-abc123',
        trigger: '@Sky',
        added_at: '2026-04-05T00:00:00Z',
        requiresTrigger: false,
      });

      const res = await authedPost(port, '/api/workers', {
        todoId: 'abc123',
        title: 'Test task',
        description: 'Do something',
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.workerJid).toBe('worker:todo-abc123@nanoclaw');
      expect(body.workerFolder).toBe('worker:todo-abc123');
      expect(mockCreateWorker).toHaveBeenCalledWith(
        expect.objectContaining({
          todoId: 'abc123',
          title: 'Test task',
          description: 'Do something',
        }),
      );
    });

    it('returns 400 if todoId missing', async () => {
      const res = await authedPost(port, '/api/workers', { title: 'No ID' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 if title missing', async () => {
      const res = await authedPost(port, '/api/workers', { todoId: 'abc' });
      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/workers/:todoId
  // -----------------------------------------------------------------------
  describe('DELETE /api/workers/:todoId', () => {
    it('destroys worker and returns ok', async () => {
      const res = await authedDelete(port, '/api/workers/abc123');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.todoId).toBe('abc123');
      expect(mockDestroyWorker).toHaveBeenCalledWith('abc123');
    });
  });

  // -----------------------------------------------------------------------
  // Other
  // -----------------------------------------------------------------------
  describe('other', () => {
    it('GET /unknown returns 404', async () => {
      const res = await authedGet(port, '/api/unknown-endpoint');
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Not found');
    });

    it('response Content-Type is application/json', async () => {
      const res = await authedGet(port, '/api/status');
      expect(res.headers['content-type']).toBe('application/json');
    });
  });
});
