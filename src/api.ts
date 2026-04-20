/**
 * Thin HTTP API bridge for NanoClaw.
 *
 * Exposes REST endpoints that map to the existing IPC file system and
 * SQLite database.  Authentication is via Bearer token (NANOCLAW_API_KEY).
 * Designed to be consumed by external AI agents, dashboards, or scripts.
 */
import {
  createServer,
  IncomingMessage,
  request as httpRequest,
  Server,
  ServerResponse,
} from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllTasks,
  getMessagesSince,
  storeMessage,
  storeChatMetadata,
  getTaskById,
} from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { createWorker, destroyWorker, workerJid } from './worker.js';
import { RegisteredGroup } from './types.js';

// ---------------------------------------------------------------------------
// Worker callbacks (wired from index.ts to keep in-memory state in sync)
// ---------------------------------------------------------------------------

let onWorkerCreatedFn: ((jid: string, group: RegisteredGroup) => void) | null =
  null;
let onWorkerDestroyedFn: ((jid: string) => void) | null = null;

export function setWorkerCallbacks(
  onCreate: (jid: string, group: RegisteredGroup) => void,
  onDestroy: (jid: string) => void,
): void {
  onWorkerCreatedFn = onCreate;
  onWorkerDestroyedFn = onDestroy;
}

// Injected from index.ts so /api/delegate-sync can call the same
// runDelegation primitive the IPC delegate path uses.
type RunDelegationFn = (
  targetFolder: string,
  prompt: string,
) => Promise<{
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}>;
let runDelegationFn: RunDelegationFn | null = null;
export function setRunDelegationFn(fn: RunDelegationFn): void {
  runDelegationFn = fn;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const fromEnv = process.env.NANOCLAW_API_KEY;
  if (fromEnv) return fromEnv;
  const secrets = readEnvFile(['NANOCLAW_API_KEY']);
  return secrets.NANOCLAW_API_KEY || '';
}

function authenticate(req: IncomingMessage): boolean {
  const apiKey = getApiKey();
  if (!apiKey) {
    // No key configured — reject all requests for safety
    return false;
  }
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Constant-time comparison
  if (token.length !== apiKey.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(apiKey));
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseUrl(url: string): {
  path: string;
  query: Record<string, string>;
} {
  const qIdx = url.indexOf('?');
  const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;
  const query: Record<string, string> = {};
  if (qIdx >= 0) {
    for (const part of url.slice(qIdx + 1).split('&')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx >= 0) {
        query[decodeURIComponent(part.slice(0, eqIdx))] = decodeURIComponent(
          part.slice(eqIdx + 1),
        );
      }
    }
  }
  return { path: pathname, query };
}

// ---------------------------------------------------------------------------
// IPC write helper — same atomic temp+rename pattern containers use
// ---------------------------------------------------------------------------

function writeIpcFile(
  groupFolder: string,
  subDir: 'messages' | 'tasks',
  data: Record<string, unknown>,
): string {
  const dir = path.join(DATA_DIR, 'ipc', groupFolder, subDir);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filePath = path.join(dir, filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data));
  fs.renameSync(tmpPath, filePath);
  return filename;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleStatus(_req: IncomingMessage, res: ServerResponse): void {
  const groups = getAllRegisteredGroups();
  const tasks = getAllTasks();
  json(res, 200, {
    ok: true,
    uptime: process.uptime(),
    groups: Object.keys(groups).length,
    activeTasks: tasks.filter((t) => t.status === 'active').length,
    totalTasks: tasks.length,
  });
}

function handleGetGroups(_req: IncomingMessage, res: ServerResponse): void {
  const groups = getAllRegisteredGroups();
  const result = Object.entries(groups).map(([jid, g]) => ({
    jid,
    name: g.name,
    folder: g.folder,
    trigger: g.trigger,
    isMain: g.isMain || false,
    requiresTrigger: g.requiresTrigger,
    addedAt: g.added_at,
  }));
  json(res, 200, result);
}

function handleGetChats(
  _req: IncomingMessage,
  res: ServerResponse,
  query: Record<string, string>,
): void {
  const chats = getAllChats();
  const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
  json(res, 200, chats.slice(0, limit));
}

function handleGetTasks(_req: IncomingMessage, res: ServerResponse): void {
  const tasks = getAllTasks();
  json(res, 200, tasks);
}

function handleGetMessages(
  _req: IncomingMessage,
  res: ServerResponse,
  chatJid: string,
  query: Record<string, string>,
): void {
  // Verify the JID belongs to a registered group
  const groups = getAllRegisteredGroups();
  if (!groups[chatJid]) {
    json(res, 404, { error: 'Group not found' });
    return;
  }
  const since = query.since || '';
  const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
  const messages = getMessagesSince(chatJid, since, '', limit);
  json(res, 200, messages);
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { chatJid, text } = body as { chatJid?: string; text?: string };
  if (!chatJid || !text) {
    json(res, 400, { error: 'chatJid and text are required' });
    return;
  }

  // Find which group folder owns this JID to determine IPC source directory.
  // We write as the main group so the IPC watcher authorises the send.
  const groups = getAllRegisteredGroups();
  const mainGroup = Object.values(groups).find((g) => g.isMain);
  if (!mainGroup) {
    json(res, 500, { error: 'No main group configured' });
    return;
  }

  const filename = writeIpcFile(mainGroup.folder, 'messages', {
    type: 'message',
    chatJid,
    text,
  });

  json(res, 202, { ok: true, ipcFile: filename });
}

// Hard ceiling on how long /api/delegate-sync will hold the HTTP response.
// Callers (MC's delegateSync) have their own 90s timeout; this is the
// server-side backstop so a hanging specialist can't pin a connection and
// the runtime forever.
const DELEGATE_SYNC_TIMEOUT_MS = 120_000;

async function handlePostDelegateSync(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { targetGroup, prompt } = body as {
    targetGroup?: string;
    prompt?: string;
  };
  if (!targetGroup || !prompt) {
    json(res, 400, { error: 'targetGroup and prompt are required' });
    return;
  }
  if (!isValidGroupFolder(targetGroup)) {
    json(res, 400, { error: 'Invalid targetGroup folder name' });
    return;
  }
  if (!runDelegationFn) {
    json(res, 503, {
      error: 'Delegation not wired yet — server still starting',
    });
    return;
  }

  // If the client drops (MC's 90s timeout fires), stop bothering with the
  // response. The delegate container keeps running in the background — the
  // IPC side will collect its result via the normal session-file flush.
  let clientAborted = false;
  req.on('close', () => {
    if (!res.writableEnded) clientAborted = true;
  });

  // runDelegation runs the specialist container, captures its output, and
  // resolves with { status, result }. Unlike /api/delegate this waits in
  // the handler for the result before replying — no IPC result-file round-
  // trip, no collision with source-group message processing.
  let timer: NodeJS.Timeout | null = null;
  const timeoutErr = new Error('delegate-sync timeout');
  try {
    const out = await Promise.race([
      runDelegationFn(targetGroup, prompt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutErr), DELEGATE_SYNC_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (clientAborted) return;
    if (out.status === 'success' && out.result != null) {
      json(res, 200, { ok: true, result: out.result });
    } else {
      json(res, 502, {
        ok: false,
        error: out.error ?? 'Specialist returned no result',
      });
    }
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (clientAborted) return;
    if (err === timeoutErr) {
      logger.warn(
        { targetGroup, timeoutMs: DELEGATE_SYNC_TIMEOUT_MS },
        '/api/delegate-sync timed out',
      );
      json(res, 504, { ok: false, error: 'Specialist timed out' });
      return;
    }
    logger.error({ err, targetGroup }, '/api/delegate-sync failed');
    json(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handlePostDelegate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { targetGroup, prompt } = body as {
    targetGroup?: string;
    prompt?: string;
  };
  if (!targetGroup || !prompt) {
    json(res, 400, { error: 'targetGroup and prompt are required' });
    return;
  }
  if (!isValidGroupFolder(targetGroup)) {
    json(res, 400, { error: 'Invalid targetGroup folder name' });
    return;
  }

  const groups = getAllRegisteredGroups();
  const mainGroup = Object.values(groups).find((g) => g.isMain);
  if (!mainGroup) {
    json(res, 500, { error: 'No main group configured' });
    return;
  }

  const delegationId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  writeIpcFile(mainGroup.folder, 'tasks', {
    type: 'delegate',
    targetGroup,
    prompt,
    delegationId,
  });

  json(res, 202, { ok: true, delegationId });
}

async function handlePostTask(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { prompt, scheduleType, scheduleValue, targetJid, contextMode } =
    body as {
      prompt?: string;
      scheduleType?: string;
      scheduleValue?: string;
      targetJid?: string;
      contextMode?: string;
    };

  if (!prompt || !scheduleType || !scheduleValue || !targetJid) {
    json(res, 400, {
      error: 'prompt, scheduleType, scheduleValue, and targetJid are required',
    });
    return;
  }

  const groups = getAllRegisteredGroups();
  const mainGroup = Object.values(groups).find((g) => g.isMain);
  if (!mainGroup) {
    json(res, 500, { error: 'No main group configured' });
    return;
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  writeIpcFile(mainGroup.folder, 'tasks', {
    type: 'schedule_task',
    taskId,
    prompt,
    schedule_type: scheduleType,
    schedule_value: scheduleValue,
    targetJid,
    context_mode: contextMode || 'isolated',
  });

  json(res, 202, { ok: true, taskId });
}

async function handlePatchTask(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const task = getTaskById(taskId);
  if (!task) {
    json(res, 404, { error: 'Task not found' });
    return;
  }

  const body = JSON.parse(await readBody(req));
  const { action, prompt, scheduleType, scheduleValue } = body as {
    action?: 'pause' | 'resume' | 'cancel' | 'update';
    prompt?: string;
    scheduleType?: string;
    scheduleValue?: string;
  };

  const groups = getAllRegisteredGroups();
  const mainGroup = Object.values(groups).find((g) => g.isMain);
  if (!mainGroup) {
    json(res, 500, { error: 'No main group configured' });
    return;
  }

  if (action === 'pause') {
    writeIpcFile(mainGroup.folder, 'tasks', { type: 'pause_task', taskId });
  } else if (action === 'resume') {
    writeIpcFile(mainGroup.folder, 'tasks', { type: 'resume_task', taskId });
  } else if (action === 'cancel') {
    writeIpcFile(mainGroup.folder, 'tasks', { type: 'cancel_task', taskId });
  } else {
    writeIpcFile(mainGroup.folder, 'tasks', {
      type: 'update_task',
      taskId,
      prompt,
      schedule_type: scheduleType,
      schedule_value: scheduleValue,
    });
  }

  json(res, 202, { ok: true, taskId });
}

async function handlePostInject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { chatJid, text, senderName } = body as {
    chatJid?: string;
    text?: string;
    senderName?: string;
  };
  if (!chatJid || !text) {
    json(res, 400, { error: 'chatJid and text are required' });
    return;
  }

  const groups = getAllRegisteredGroups();
  if (!groups[chatJid]) {
    json(res, 404, { error: 'Group not found for JID' });
    return;
  }

  const msgId = `inject-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  storeMessage({
    id: msgId,
    chat_jid: chatJid,
    sender: senderName || 'system',
    sender_name: senderName || 'System',
    content: text,
    timestamp: new Date().toISOString(),
    is_from_me: false,
    is_bot_message: false,
  });

  json(res, 202, { ok: true, messageId: msgId });
}

// ---------------------------------------------------------------------------
// Worker endpoints
// ---------------------------------------------------------------------------

async function handlePostWorker(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const { todoId, title, description, targetAgentFolder } = body as {
    todoId?: string;
    title?: string;
    description?: string;
    targetAgentFolder?: string;
  };
  if (!todoId || !title) {
    json(res, 400, { error: 'todoId and title are required' });
    return;
  }

  const groups = getAllRegisteredGroups();
  const mainEntry = Object.entries(groups).find(([, g]) => g.isMain);
  if (!mainEntry) {
    json(res, 500, { error: 'No main group configured' });
    return;
  }
  const [mainJid, mainGroup] = mainEntry;

  // Build the assignment message once (shared by both paths)
  const descLine = description ? `\nDescription: ${description}` : '';
  const assignmentText = `@Sky You've been assigned a todo.

Title: "${title}"${descLine}
Todo ID: ${todoId}

Follow the worker workflow in your CLAUDE.md. Start by setting status to "in_progress", then do the work, then set status to "awaiting_review" with your output in result_content.

Use todo_get with id "${todoId}" to see full details.`;

  // If a target agent folder is specified, route directly to that existing agent
  if (targetAgentFolder) {
    const targetEntry = Object.entries(groups).find(
      ([, g]) => g.folder === targetAgentFolder,
    );
    if (targetEntry) {
      const [targetJid, targetGroup] = targetEntry;

      // Ensure chat record exists (FK constraint on messages table)
      storeChatMetadata(targetJid, new Date().toISOString());

      const msgId = `worker-assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      storeMessage({
        id: msgId,
        chat_jid: targetJid,
        sender: 'system',
        sender_name: 'System',
        content: assignmentText,
        timestamp: new Date().toISOString(),
        is_from_me: false,
        is_bot_message: false,
      });

      json(res, 201, {
        ok: true,
        workerJid: targetJid,
        workerFolder: targetGroup.folder,
        messageId: msgId,
      });
      return;
    }
    logger.warn(
      { targetAgentFolder },
      'Target agent folder not found, falling back to generic worker',
    );
  }

  // Generic worker creation (no targetAgentFolder or agent not found)
  const registration = await createWorker({
    todoId,
    title,
    description,
    mainGroupFolder: mainGroup.folder,
    notifyJid: mainJid,
  });

  const jid = workerJid(todoId);
  if (onWorkerCreatedFn) onWorkerCreatedFn(jid, registration);

  // Inject assignment message into the worker's JID
  storeChatMetadata(
    jid,
    new Date().toISOString(),
    registration.name,
    'worker',
    false,
  );

  const msgId = `worker-assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  storeMessage({
    id: msgId,
    chat_jid: jid,
    sender: 'system',
    sender_name: 'System',
    content: assignmentText,
    timestamp: new Date().toISOString(),
    is_from_me: false,
    is_bot_message: false,
  });

  json(res, 201, {
    ok: true,
    workerJid: jid,
    workerFolder: registration.folder,
    messageId: msgId,
  });
}

async function handleDeleteWorker(
  _req: IncomingMessage,
  res: ServerResponse,
  todoId: string,
): Promise<void> {
  const jid = workerJid(todoId);
  if (onWorkerDestroyedFn) onWorkerDestroyedFn(jid);
  await destroyWorker(todoId);
  json(res, 200, { ok: true, todoId });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { path: urlPath, query } = parseUrl(req.url || '/');
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // Public root — unauthenticated health check
  if (method === 'GET' && (urlPath === '/' || urlPath === '')) {
    json(res, 200, {
      name: 'NanoClaw API',
      status: 'online',
      auth: 'Bearer token required for /api/* endpoints',
    });
    return;
  }

  // Auth check
  if (!authenticate(req)) {
    json(res, 401, {
      error: 'Unauthorized — pass Authorization: Bearer <key>',
    });
    return;
  }

  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET /api/status
  if (method === 'GET' && urlPath === '/api/status') {
    handleStatus(req, res);
    return;
  }

  // GET /api/groups
  if (method === 'GET' && urlPath === '/api/groups') {
    handleGetGroups(req, res);
    return;
  }

  // GET /api/chats
  if (method === 'GET' && urlPath === '/api/chats') {
    handleGetChats(req, res, query);
    return;
  }

  // GET /api/tasks
  if (method === 'GET' && urlPath === '/api/tasks') {
    handleGetTasks(req, res);
    return;
  }

  // POST /api/tasks
  if (method === 'POST' && urlPath === '/api/tasks') {
    await handlePostTask(req, res);
    return;
  }

  // PATCH /api/tasks/:id
  const taskMatch = urlPath.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && method === 'PATCH') {
    await handlePatchTask(req, res, decodeURIComponent(taskMatch[1]));
    return;
  }

  // GET /api/messages/:jid
  const msgMatch = urlPath.match(/^\/api\/messages\/(.+)$/);
  if (msgMatch && method === 'GET') {
    handleGetMessages(req, res, decodeURIComponent(msgMatch[1]), query);
    return;
  }

  // POST /api/message
  if (method === 'POST' && urlPath === '/api/message') {
    await handlePostMessage(req, res);
    return;
  }

  // POST /api/inject — store a synthetic inbound message to trigger an agent
  if (method === 'POST' && urlPath === '/api/inject') {
    await handlePostInject(req, res);
    return;
  }

  // POST /api/delegate
  if (method === 'POST' && urlPath === '/api/delegate') {
    await handlePostDelegate(req, res);
    return;
  }

  // POST /api/delegate-sync — blocks until the specialist responds
  if (method === 'POST' && urlPath === '/api/delegate-sync') {
    await handlePostDelegateSync(req, res);
    return;
  }

  // POST /api/workers
  if (method === 'POST' && urlPath === '/api/workers') {
    await handlePostWorker(req, res);
    return;
  }

  // DELETE /api/workers/:todoId
  const workerMatch = urlPath.match(/^\/api\/workers\/([^/]+)$/);
  if (workerMatch && method === 'DELETE') {
    await handleDeleteWorker(req, res, decodeURIComponent(workerMatch[1]));
    return;
  }

  // Proxy /api/todos/* to Mission Control (port 3002)
  if (urlPath.startsWith('/api/todos')) {
    const mcPath = `${urlPath}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
    const bodyText =
      method === 'POST' || method === 'PUT' || method === 'PATCH'
        ? await readBody(req)
        : undefined;
    const proxyReq = httpRequest(
      {
        hostname: 'localhost',
        port: 3002,
        path: mcPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyText
            ? { 'Content-Length': Buffer.byteLength(bodyText) }
            : {}),
        },
      },
      (mcRes) => {
        const chunks: Buffer[] = [];
        mcRes.on('data', (c) => chunks.push(c));
        mcRes.on('end', () => {
          res.writeHead(mcRes.statusCode!, {
            'Content-Type': 'application/json',
          });
          res.end(Buffer.concat(chunks));
        });
      },
    );
    proxyReq.on('error', () =>
      json(res, 502, { error: 'Mission Control unavailable' }),
    );
    if (bodyText) proxyReq.write(bodyText);
    proxyReq.end();
    return;
  }

  json(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function startApiServer(port: number, host: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      route(req, res).catch((err) => {
        logger.error({ err, url: req.url }, 'API request error');
        if (!res.headersSent) {
          json(res, 500, { error: 'Internal server error' });
        }
      });
    });

    server.listen(port, host, () => {
      const apiKey = getApiKey();
      logger.info({ port, host, hasApiKey: !!apiKey }, 'API server started');
      if (!apiKey) {
        logger.warn(
          'NANOCLAW_API_KEY not set — all API requests will be rejected. Add it to .env',
        );
      }
      resolve(server);
    });

    server.on('error', reject);
  });
}
