import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  DEFAULT_TRIGGER,
  GROUPS_DIR,
} from './config.js';
import {
  deleteRegisteredGroup,
  deleteSession,
  setRegisteredGroup,
} from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TodoContext {
  todoId: string;
  title: string;
  description?: string;
  notifyJid?: string;
}

export interface CreateWorkerOpts {
  todoId: string;
  title: string;
  description?: string;
  mainGroupFolder: string;
  notifyJid?: string;
}

export interface TrashEntry {
  name: string;
  path: string;
  trashedAt: string;
  ageDays: number;
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

export function workerJid(todoId: string): string {
  return `worker:todo-${todoId}@nanoclaw`;
}

export function workerFolder(todoId: string): string {
  return `worker-todo-${todoId}`;
}

export function isWorkerJid(jid: string): boolean {
  return /^worker:todo-.+@nanoclaw$/.test(jid);
}

export function isTodoWorkerFolder(folder: string): boolean {
  return /^worker-todo-.+$/.test(folder);
}

// ---------------------------------------------------------------------------
// CLAUDE.md generation
// ---------------------------------------------------------------------------

const MINIMAL_TEMPLATE = `# ${ASSISTANT_NAME}\n\nWorker agent.\n`;

export function generateWorkerClaudeMd(
  baseTemplate: string,
  todoContext: TodoContext,
): string {
  // Replace the top-level header with Worker variant
  let md = baseTemplate.replace(/^# .+$/m, `# ${ASSISTANT_NAME} — Worker`);

  // Append todo-specific section
  const descLine = todoContext.description
    ? `\n**Description:** ${todoContext.description}\n`
    : '';

  const notifyLine = todoContext.notifyJid
    ? `\n**Notify JID:** ${todoContext.notifyJid} (use this as chatJid when calling send_message)\n`
    : '';

  md += `
---

## Current Assignment

**Todo ID:** ${todoContext.todoId}
**Title:** ${todoContext.title}
${descLine}${notifyLine}
## Worker Workflow

You are a worker container assigned to a single todo. Follow this workflow:

1. Set the todo status to "in_progress" using todo_update so the user knows you've started.
2. Do the work. Use all your available tools.
3. When done, use todo_update to:
   - Set status to "awaiting_review" (NEVER "completed" — only the user marks things completed)
   - Set result_content — always READ existing content first with todo_get and APPEND your update under a new "### Agent — Round N" header. Never overwrite previous rounds.
4. Notify the user via send_message${todoContext.notifyJid ? ` (chatJid: "${todoContext.notifyJid}")` : ''} that the task is ready for review. Keep the notification short — just say what you did and that it's ready for review in the todo card.

Use todo_get with id "${todoContext.todoId}" to see full details before starting.

## When You Can't Complete Something

You are running in a container with limited privileges. If you hit a permission or access barrier (e.g. read-only mount, no sudo, can't reach a service, need credentials you don't have):

1. **Don't stall or retry endlessly.** Acknowledge what you can't do.
2. **Write clear handoff instructions** in result_content explaining:
   - What you already completed
   - What still needs to be done, with exact steps (file paths, commands, code changes) — detailed enough to copy-paste to another agent or the user
   - Why you couldn't do it (the specific access limitation)
3. **Create a subtask** for each piece of pending work using todo_create with the parent todo ID. Give each subtask a clear title and description with the exact instructions.
4. Set the todo to "awaiting_review" and notify the user that partial work is done and subtasks have been created for the rest.
`;

  md += `\n## Attachments\n\nThis todo may have file attachments. After calling \`todo_get\`, check the \`attachments\` array in the response. If attachments exist, read them from:\n\n\`/workspace/mission-control/data/attachments/${todoContext.todoId}/{filename}\`\n\nUse the Read tool to view each attachment. Claude can natively read images (PNG, JPG, etc.), PDFs, and all text/code files.\n`;

  return md;
}

// ---------------------------------------------------------------------------
// Lifecycle: createWorker
// ---------------------------------------------------------------------------

export async function createWorker(
  opts: CreateWorkerOpts,
): Promise<RegisteredGroup> {
  const folder = workerFolder(opts.todoId);
  const jid = workerJid(opts.todoId);
  const folderPath = path.join(GROUPS_DIR, folder);

  // 1. Read base template from main group
  let baseTemplate: string;
  const mainClaudeMd = path.join(GROUPS_DIR, opts.mainGroupFolder, 'CLAUDE.md');
  try {
    baseTemplate = fs.readFileSync(mainClaudeMd, 'utf-8');
  } catch {
    logger.warn(
      { path: mainClaudeMd },
      'Main CLAUDE.md not found, using minimal template',
    );
    baseTemplate = MINIMAL_TEMPLATE;
  }

  // 2. Generate worker CLAUDE.md
  const todoContext: TodoContext = {
    todoId: opts.todoId,
    title: opts.title,
    description: opts.description,
    notifyJid: opts.notifyJid,
  };
  const claudeMd = generateWorkerClaudeMd(baseTemplate, todoContext);

  // 3. Create folder structure
  fs.mkdirSync(path.join(folderPath, 'logs'), { recursive: true });

  // 4. Write CLAUDE.md
  fs.writeFileSync(path.join(folderPath, 'CLAUDE.md'), claudeMd, 'utf-8');

  // 5. Register in DB (workers inherit Opus model for quality)
  const registration: RegisteredGroup = {
    name: `Worker: ${opts.title}`,
    folder,
    trigger: DEFAULT_TRIGGER,
    added_at: new Date().toISOString(),
    requiresTrigger: false,
    containerConfig: { model: 'claude-opus-4-7' },
  };

  setRegisteredGroup(jid, registration);

  logger.info({ todoId: opts.todoId, folder }, 'Worker created');

  return registration;
}

// ---------------------------------------------------------------------------
// Lifecycle: destroyWorker
// ---------------------------------------------------------------------------

export async function destroyWorker(todoId: string): Promise<void> {
  const folder = workerFolder(todoId);
  const jid = workerJid(todoId);

  // Path safety: validate folder name AND resolved path stays inside GROUPS_DIR
  if (
    !isTodoWorkerFolder(folder) ||
    folder.includes('..') ||
    folder.includes('/')
  ) {
    logger.error({ folder }, 'destroyWorker: invalid worker folder name');
    return;
  }

  const resolvedGroupPath = path.resolve(GROUPS_DIR, folder);
  if (!resolvedGroupPath.startsWith(path.resolve(GROUPS_DIR) + path.sep)) {
    logger.error(
      { folder, resolvedGroupPath },
      'destroyWorker: path escapes GROUPS_DIR',
    );
    return;
  }

  // 1. Unregister from DB
  deleteRegisteredGroup(jid);
  deleteSession(folder);

  // 2. Write _close IPC sentinel
  const ipcInputDir = path.join(DATA_DIR, 'ipc', folder, 'input');
  try {
    fs.mkdirSync(ipcInputDir, { recursive: true });
    fs.writeFileSync(path.join(ipcInputDir, '_close'), '', 'utf-8');
  } catch (err) {
    logger.warn({ err, folder }, 'Could not write _close sentinel');
  }

  // 3. Move group folder to trash
  const trashDir = path.join(DATA_DIR, 'trash');
  fs.mkdirSync(trashDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trashName = `${folder}--${timestamp}`;

  if (fs.existsSync(resolvedGroupPath)) {
    fs.renameSync(resolvedGroupPath, path.join(trashDir, trashName));
  }

  // 4. Move session folder to trash
  const sessionPath = path.join(DATA_DIR, 'sessions', folder);
  if (fs.existsSync(sessionPath)) {
    fs.renameSync(
      sessionPath,
      path.join(trashDir, `${folder}-session--${timestamp}`),
    );
  }

  logger.info({ todoId, folder }, 'Worker destroyed (soft-deleted to trash)');
}

// ---------------------------------------------------------------------------
// Trash management
// ---------------------------------------------------------------------------

export function listTrash(minAgeDays: number): TrashEntry[] {
  const trashDir = path.join(DATA_DIR, 'trash');
  if (!fs.existsSync(trashDir)) return [];

  const entries: TrashEntry[] = [];
  const now = Date.now();

  for (const name of fs.readdirSync(trashDir)) {
    const ts = parseTrashTimestamp(name);
    if (!ts) continue;

    const ageMs = now - ts.getTime();
    const ageDays = ageMs / 86400000;

    if (ageDays >= minAgeDays) {
      entries.push({
        name,
        path: path.join(trashDir, name),
        trashedAt: ts.toISOString(),
        ageDays: Math.floor(ageDays),
      });
    }
  }

  return entries;
}

export function purgeTrash(paths: string[]): void {
  const trashDir = path.resolve(DATA_DIR, 'trash');

  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!resolved.startsWith(trashDir + path.sep) && resolved !== trashDir) {
      logger.error(
        { path: p },
        'purgeTrash: refusing to delete path outside trash directory',
      );
      continue;
    }

    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      logger.info({ path: p }, 'Purged trash entry');
    } catch (err) {
      logger.warn({ err, path: p }, 'Failed to purge trash entry');
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the ISO timestamp suffix from a trash folder name.
 * Format: `anything--YYYY-MM-DDTHH-MM-SS-mmmZ`
 */
function parseTrashTimestamp(name: string): Date | null {
  const match = name.match(/--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);
  if (!match) return null;

  // Restore the ISO format: replace dashes back to colons/dots in the time part
  const raw = match[1];
  // YYYY-MM-DDTHH-MM-SS-mmmZ → YYYY-MM-DDTHH:MM:SS.mmmZ
  const iso = raw.replace(
    /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    'T$1:$2:$3.$4Z',
  );

  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}
