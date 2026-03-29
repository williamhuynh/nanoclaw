# AI-Native Todo System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current basic todo system with an AI-native shared task list between human and agents — brain dump input, AI-inferred metadata, MCP tools for agent access, conversational UI.

**Architecture:** Todos live in Mission Control's SQLite DB with an enhanced schema. Agents interact via MCP tools (container-side) that call Mission Control's REST API over HTTP. Brain dumps flow through the existing WebSocket chat bridge to NanoClaw for AI parsing. Notifications go via NanoClaw's IPC message system to Telegram.

**Tech Stack:** Mission Control (React 19, Express 5, better-sqlite3, ws, Tailwind CSS 4, TanStack React Query, dnd-kit), NanoClaw container agent (MCP SDK, zod), NanoClaw API proxy

---

### Task 1: Migrate Database Schema

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/server/db.ts`

**Step 1: Replace the schema creation**

Replace the existing `todos` and `subtasks` CREATE TABLE statements in `db.ts` with the new schema:

```typescript
// In initMCDatabase(), replace the existing todos/subtasks CREATE TABLE blocks:

db.exec(`
  DROP TABLE IF EXISTS subtasks;
  DROP TABLE IF EXISTS todos;

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    horizon TEXT DEFAULT 'none',
    owner TEXT DEFAULT 'human',
    source TEXT DEFAULT 'manual',
    source_ref TEXT,
    context TEXT DEFAULT 'work',
    result_content TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    owner TEXT DEFAULT 'human',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );
`);
```

**Step 2: Verify the DB initialises**

```bash
cd /home/nanoclaw/apps/mission-control
npx tsx -e "import { initMCDatabase } from './src/server/db.js'; const db = initMCDatabase(); console.log(db.pragma('table_info(todos)')); console.log(db.pragma('table_info(subtasks)'));"
```

Expected: column list matching the new schema.

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/server/db.ts
git commit -m "feat(todo): migrate schema to AI-native model

New columns: horizon, owner, source, source_ref, context, result_content.
Removed: priority, due_date, tags, assigned_group.
Subtasks gain owner field."
```

---

### Task 2: Update REST API Routes

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/server/routes/todos.ts`

**Step 1: Update TypeScript interfaces**

At the top of the file, add/update the interfaces:

```typescript
interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'awaiting_review' | 'completed' | 'cancelled';
  horizon: 'today' | 'this_week' | 'soon' | 'none';
  owner: string;
  source: 'manual' | 'brain_dump' | 'agent' | 'meeting' | 'channel';
  source_ref: string | null;
  context: 'work' | 'personal' | 'admin';
  result_content: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
}

interface Subtask {
  id: string;
  todo_id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  owner: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Update all route handlers**

Rewrite the route handlers to use the new schema fields. Key changes:

- **GET /api/todos**: Replace `priority`, `tag`, `group` query params with `status`, `horizon`, `owner`, `context`. Order by horizon (today first), then attention items (awaiting_review) at top, then sort_order.
- **POST /api/todos**: Accept new fields (horizon, owner, source, source_ref, context). Drop priority, due_date, tags, assigned_group.
- **PUT /api/todos/:id**: Accept new fields including result_content. Always update `updated_at`.
- **POST /api/todos/:id/subtasks**: Add `owner` field support.
- **PUT /api/todos/:todoId/subtasks/:id**: Add `owner` field support.

Keep existing: DELETE routes, reorder route, subtask DELETE — these work as-is.

**Step 3: Add search endpoint**

Add a new route for text search:

```typescript
// GET /api/todos/search?q=keyword
router.get('/search', (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  const todos = db.prepare(`
    SELECT * FROM todos
    WHERE title LIKE ? OR description LIKE ?
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(`%${q}%`, `%${q}%`);
  // Attach subtasks to each todo
  res.json(todos.map(t => todoWithSubtasks(t)));
});
```

**Step 4: Test the API with curl**

```bash
# Create a todo
curl -s -X POST http://localhost:3002/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test todo","horizon":"today","context":"work"}' | jq .

# List todos
curl -s http://localhost:3002/api/todos | jq .

# Update todo
curl -s -X PUT http://localhost:3002/api/todos/<id> \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress","owner":"main"}' | jq .
```

**Step 5: Commit**

```bash
git add src/server/routes/todos.ts
git commit -m "feat(todo): update REST API for AI-native schema

New query params: horizon, owner, context. Attention-first sorting.
Search endpoint. result_content and owner on subtasks."
```

---

### Task 3: Build MCP Todo Tools (Container-Side)

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/container/agent-runner/src/ipc-mcp-stdio.ts`

**Step 1: Add HTTP helper at top of file**

```typescript
import http from 'http';

function mcFetch(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3002,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode!, data: text });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
```

**Step 2: Add todo MCP tools**

Add after the existing `delegate` tool:

```typescript
// --- Todo MCP Tools ---

server.tool(
  'todo_list',
  'List todos. Optionally filter by status, owner, horizon, or context.',
  {
    status: z.string().optional().describe('Filter: pending, in_progress, awaiting_review, completed, cancelled'),
    owner: z.string().optional().describe('Filter by owner: "human" or agent folder name'),
    horizon: z.string().optional().describe('Filter: today, this_week, soon, none'),
    context: z.string().optional().describe('Filter: work, personal, admin'),
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.status) params.set('status', args.status);
    if (args.owner) params.set('owner', args.owner);
    if (args.horizon) params.set('horizon', args.horizon);
    if (args.context) params.set('context', args.context);
    const qs = params.toString();
    const { data } = await mcFetch('GET', `/api/todos${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'todo_get',
  'Get a single todo by ID, including its subtasks.',
  {
    id: z.string().describe('The todo ID'),
  },
  async (args) => {
    const { data, status } = await mcFetch('GET', `/api/todos`);
    const todos = data as Array<{ id: string }>;
    const todo = todos.find((t) => t.id === args.id);
    if (!todo) return { content: [{ type: 'text' as const, text: 'Todo not found' }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(todo, null, 2) }] };
  },
);

server.tool(
  'todo_create',
  'Create a new todo item.',
  {
    title: z.string().describe('Todo title'),
    description: z.string().optional().describe('Detailed description'),
    horizon: z.enum(['today', 'this_week', 'soon', 'none']).optional().describe('Time horizon'),
    owner: z.string().optional().describe('"human" or agent folder name'),
    context: z.enum(['work', 'personal', 'admin']).optional().describe('Category'),
    source: z.enum(['manual', 'brain_dump', 'agent', 'meeting', 'channel']).optional(),
    source_ref: z.string().optional().describe('Reference ID (meeting ID, message ID, etc.)'),
  },
  async (args) => {
    const { data, status } = await mcFetch('POST', '/api/todos', {
      title: args.title,
      description: args.description,
      horizon: args.horizon || 'none',
      owner: args.owner || 'human',
      context: args.context || 'work',
      source: args.source || 'agent',
      source_ref: args.source_ref,
    });
    if (status >= 400) return { content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'todo_update',
  'Update a todo. Use to change status, owner, horizon, or add result_content.',
  {
    id: z.string().describe('The todo ID'),
    status: z.enum(['pending', 'in_progress', 'awaiting_review', 'completed', 'cancelled']).optional(),
    horizon: z.enum(['today', 'this_week', 'soon', 'none']).optional(),
    owner: z.string().optional().describe('"human" or agent folder name'),
    result_content: z.string().optional().describe('Agent output for review (markdown)'),
    description: z.string().optional(),
    context: z.enum(['work', 'personal', 'admin']).optional(),
  },
  async (args) => {
    const { id, ...updates } = args;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) body[k] = v;
    }
    const { data, status } = await mcFetch('PUT', `/api/todos/${id}`, body);
    if (status >= 400) return { content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'subtask_create',
  'Add a subtask to a todo.',
  {
    todo_id: z.string().describe('Parent todo ID'),
    title: z.string().describe('Subtask title'),
    owner: z.string().optional().describe('"human" or agent folder name'),
  },
  async (args) => {
    const { data, status } = await mcFetch('POST', `/api/todos/${args.todo_id}/subtasks`, {
      title: args.title,
      owner: args.owner || 'human',
    });
    if (status >= 400) return { content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'subtask_update',
  'Update a subtask status or title.',
  {
    todo_id: z.string().describe('Parent todo ID'),
    subtask_id: z.string().describe('Subtask ID'),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    title: z.string().optional(),
  },
  async (args) => {
    const body: Record<string, unknown> = {};
    if (args.status) body.status = args.status;
    if (args.title) body.title = args.title;
    const { data, status } = await mcFetch('PUT', `/api/todos/${args.todo_id}/subtasks/${args.subtask_id}`, body);
    if (status >= 400) return { content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
);
```

**Step 3: Build the container agent**

```bash
cd /home/nanoclaw/nanoclaw/container/agent-runner
npm run build
```

**Step 4: Rebuild the container image**

```bash
cd /home/nanoclaw/nanoclaw
./container/build.sh
```

**Step 5: Commit**

```bash
cd /home/nanoclaw/nanoclaw
git add container/agent-runner/src/ipc-mcp-stdio.ts
git commit -m "feat(todo): add MCP todo tools for container agents

Tools: todo_list, todo_get, todo_create, todo_update, subtask_create,
subtask_update. Call Mission Control REST API from inside containers."
```

---

### Task 4: Add NanoClaw API Proxy for Todos

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/src/api.ts`

**Step 1: Add todo proxy endpoints**

Add before the `json(res, 404, ...)` fallback in the route function. These proxy todo requests through the NanoClaw API (port 3004, Cloudflare-exposed) to Mission Control (port 3002):

```typescript
// Proxy todo requests to Mission Control
const todoProxy = urlPath.match(/^\/api\/todos(\/.*)?$/);
if (todoProxy) {
  const mcPath = urlPath; // Same path
  const mcUrl = `http://localhost:3002${mcPath}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

  const proxyReq = http.request(mcUrl, { method, headers: { 'Content-Type': 'application/json' } }, (mcRes) => {
    const chunks: Buffer[] = [];
    mcRes.on('data', (c) => chunks.push(c));
    mcRes.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      res.writeHead(mcRes.statusCode!, { 'Content-Type': 'application/json' });
      res.end(body);
    });
  });
  proxyReq.on('error', () => json(res, 502, { error: 'Mission Control unavailable' }));

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const body = await readBody(req);
    proxyReq.write(body);
  }
  proxyReq.end();
  return;
}
```

Add `import http from 'http';` at the top of the file.

**Step 2: Build and test**

```bash
cd /home/nanoclaw/nanoclaw
npm run build

# Test via NanoClaw API
curl -s -H "Authorization: Bearer <key>" http://localhost:3004/api/todos | jq .
```

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat(todo): proxy todo endpoints through NanoClaw API

External clients can now access todos via port 3004 (Cloudflare tunnel)
with bearer token auth. Proxies to Mission Control port 3002."
```

---

### Task 5: Rewrite Frontend — TodosPage

**Files:**
- Rewrite: `/home/nanoclaw/apps/mission-control/src/frontend/pages/TodosPage.tsx`
- Rewrite: `/home/nanoclaw/apps/mission-control/src/frontend/components/TodoCard.tsx`

This is the largest task. The page has three zones: conversational input (top), horizon-grouped list (middle), completed (bottom).

**Step 1: Update TodoCard component**

Rewrite `TodoCard.tsx` to show:
- Left border colour by context (work=blue `border-l-blue-500`, personal=green `border-l-green-500`, admin=grey `border-l-zinc-400`)
- Owner icon (lucide `User` for human, `Bot` for agent + name)
- Status badge (small pill)
- Subtask progress bar
- Expanded view: description, subtasks with owners, result_content as rendered markdown, quick action buttons (approve, reassign horizon, reassign context)
- Tap horizon/context badges to cycle values (single click, no form)

**Step 2: Rewrite TodosPage**

Replace the current form-based page with:

**Top zone — Conversational input:**
- Connect to existing `/ws/chat` WebSocket (same as ChatPage)
- Text input with "What needs to be done?" placeholder
- Collapsible message thread above the input showing agent responses
- When user submits, the message goes to NanoClaw via WebSocket
- Processing spinner while waiting for agent response

**Middle zone — Horizon-grouped list:**
- Three collapsible sections: Today, This Week, Soon
- Fetch from `GET /api/todos` grouped by horizon field
- Within each section: attention items first (awaiting_review, human-owned), then by sort_order
- dnd-kit drag within sections (keep existing reorder pattern)
- Search icon in header that toggles a search bar (calls `GET /api/todos/search?q=`)

**Bottom zone — Completed:**
- Collapsed by default, expandable
- Fetches `GET /api/todos?status=completed` limited to last 7 days

**Step 3: Build and verify**

```bash
cd /home/nanoclaw/apps/mission-control
npm run build
npm start
```

Open http://localhost:3002/todos and verify the layout.

**Step 4: Commit**

```bash
git add src/frontend/pages/TodosPage.tsx src/frontend/components/TodoCard.tsx
git commit -m "feat(todo): AI-native todo UI with conversational input

Horizon-grouped list (Today/This Week/Soon), context colour coding,
owner icons, brain dump chat input via WebSocket, attention-first
sorting, collapsible completed section."
```

---

### Task 6: Wire Brain Dump to NanoClaw Agent

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/server/ws.ts`
- Create: `/home/nanoclaw/nanoclaw/container/skills/todo-brain-dump/SKILL.md`

**Step 1: Ensure chat WebSocket bridges to NanoClaw**

The existing `/ws/chat` → `/ws/nanoclaw` bridge in `ws.ts` already handles this. Verify the chat messages from the todo page reach NanoClaw and responses come back.

If the todo page needs a separate WebSocket context (so todo chat doesn't mix with the general chat), add a new endpoint `/ws/todo` that follows the same pattern as `/ws/chat` but with a separate message history.

**Step 2: Create brain dump skill**

Create a container skill that instructs the agent how to parse brain dumps:

```markdown
---
name: todo-brain-dump
description: Parse natural language brain dumps into structured todos. Auto-invoked when user sends text via the todo page.
---

# Todo Brain Dump Parser

When you receive a brain dump from the todo page, parse it into structured todos.

## Process

1. Split the text into distinct action items
2. For each item, infer:
   - title: concise action phrase
   - horizon: today (urgent/time-sensitive), this_week (should do soon), soon (no rush), none (unclear)
   - context: work (professional), personal (projects/goals), admin (life logistics)
   - owner: "human" unless the user explicitly asks an agent to do it
3. Create each todo using the todo_create MCP tool
4. If anything is ambiguous, ask the user for clarification in the chat

## Guidelines

- Keep titles short and actionable (start with a verb)
- Default horizon to "soon" if no urgency cues
- Default context to "work" if ambiguous
- If user says "Sky do X" or "agent do X", set owner to "main"
- One brain dump can produce 1-10 todos — match what the user actually said
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/nanoclaw
git add container/skills/todo-brain-dump/SKILL.md
git commit -m "feat(todo): add brain dump parsing skill for container agents"
```

---

### Task 7: Agent Assignment Trigger

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/server/routes/todos.ts`

**Step 1: Add assignment notification**

In the PUT /api/todos/:id handler, after updating the todo, check if `owner` changed from "human" to an agent name. If so, call NanoClaw API to send a message to that agent:

```typescript
// After the update succeeds:
if (req.body.owner && req.body.owner !== 'human' && previousOwner === 'human') {
  // Notify agent via NanoClaw API
  const apiKey = process.env.NANOCLAW_API_KEY;
  if (apiKey) {
    const payload = JSON.stringify({
      chatJid: updatedTodo.owner, // Agent group folder used to find JID
      text: `You've been assigned a todo: "${updatedTodo.title}"${updatedTodo.description ? '\n\n' + updatedTodo.description : ''}\n\nUse todo_get to see full details, then work on it.`,
    });
    // Fire-and-forget POST to NanoClaw API
    const notifyReq = http.request({
      hostname: 'localhost', port: 3004, path: '/api/message',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    notifyReq.on('error', () => {}); // Silent fail
    notifyReq.write(payload);
    notifyReq.end();
  }
}
```

Note: The `chatJid` lookup from agent folder name needs to use NanoClaw's `/api/groups` to resolve. Alternatively, use `/api/delegate` with `targetGroup` set to the agent's folder name — this is cleaner as it handles the JID resolution internally.

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/server/routes/todos.ts
git commit -m "feat(todo): notify agent when assigned a todo

Calls NanoClaw delegate API when owner changes from human to agent."
```

---

### Task 8: Daily Cron — Todo Digest & Agent Nudge

**Files:**
- NanoClaw scheduled task (via DB insert)

**Step 1: Create the scheduled task**

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('/home/nanoclaw/nanoclaw/store/messages.db');
const id = 'task-todo-daily';
db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
db.prepare(\`
  INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
\`).run(
  id, 'main', 'tg:6214124055',
  'Daily todo check. Use todo_list to see all pending todos. Send me a brief digest: how many items for today, how many awaiting my review, any overdue items. Then check for pending todos assigned to agents — if any agent has pending work, nudge them.',
  'cron', '30 22 * * *',
  'isolated',
  '2026-03-29T22:30:00.000Z',
  'active',
  new Date().toISOString()
);
console.log('Task created');
db.close();
"
```

**Step 2: Commit**

No file changes — task is in the database.

---

### Task 9: Seed Data & End-to-End Test

**Step 1: Seed the initial todo**

```bash
curl -s -X POST http://localhost:3002/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Build Granola auto-extract for meeting action items","horizon":"soon","context":"personal","source":"manual"}' | jq .
```

**Step 2: Restart services**

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user restart nanoclaw
systemctl --user restart mission-control
```

**Step 3: End-to-end test**

1. Open Mission Control todos page — verify new UI loads with horizon sections
2. Type a brain dump in the chat input — verify todos appear after agent processes
3. Assign a todo to "main" — verify Sky gets notified on Telegram
4. Check that MCP tools work from agent container (agent should be able to list/create todos)

**Step 4: Final commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add -A
git commit -m "feat(todo): AI-native todo system complete

Schema migration, REST API, MCP tools, brain dump chat, agent
assignment triggers, daily cron digest, seed data."
git push origin main
```

```bash
cd /home/nanoclaw/nanoclaw
git add -A
git commit -m "feat(todo): MCP tools, API proxy, brain dump skill, daily cron

Container agents can create/update/list todos via MCP tools.
NanoClaw API proxies todo endpoints for external access.
Daily 9:30am Sydney digest and agent nudge."
git push origin main
```

---

## Task Summary

| Task | Component | Estimated Steps |
|------|-----------|----------------|
| 1 | DB schema migration | 3 |
| 2 | REST API routes | 5 |
| 3 | MCP todo tools (container) | 5 |
| 4 | NanoClaw API proxy | 3 |
| 5 | Frontend rewrite (TodosPage + TodoCard) | 4 |
| 6 | Brain dump skill + WebSocket wiring | 3 |
| 7 | Agent assignment trigger | 2 |
| 8 | Daily cron task | 1 |
| 9 | Seed data + E2E test | 4 |

**Execution order:** Tasks 1-4 can be done in parallel (backend). Task 5 depends on Task 1-2. Tasks 6-7 depend on Tasks 3-4. Tasks 8-9 are last.
