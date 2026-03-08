# NanoClaw Apps Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a companion service (nanoclaw-apps) that manages app containers, and Mission Control as the first app — a full-featured dashboard, chat interface, and to-do system for the NanoClaw instance.

**Architecture:** Three separate repos on the same VPS. Companion service manages app lifecycle via Docker API. Mission Control reads NanoClaw state directly (filesystem + SQLite) and writes via a channel adapter. Integration through skills and IPC.

**Tech Stack:** Node.js, TypeScript, Express, React, Vite, Tailwind CSS, SQLite (better-sqlite3), WebSocket (ws), Docker API (dockerode)

**Design Doc:** `docs/plans/2026-03-08-nanoclaw-apps-platform-design.md`

---

## Phase 1: Companion Service Foundation (nanoclaw-apps)

### Task 1.1: Scaffold nanoclaw-apps project

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/package.json`
- Create: `/home/nanoclaw/nanoclaw-apps/tsconfig.json`
- Create: `/home/nanoclaw/nanoclaw-apps/.gitignore`
- Create: `/home/nanoclaw/nanoclaw-apps/src/index.ts`

**Step 1: Create directory and init**

```bash
mkdir -p /home/nanoclaw/nanoclaw-apps/src
cd /home/nanoclaw/nanoclaw-apps
git init
```

**Step 2: Create package.json**

```json
{
  "name": "nanoclaw-apps",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dockerode": "^4.0.0",
    "express": "^5.0.0",
    "chokidar": "^4.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/dockerode": "^3.3.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.db
```

**Step 5: Create minimal src/index.ts**

```typescript
import express from 'express';

const app = express();
const PORT = 4000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`nanoclaw-apps listening on :${PORT}`);
});
```

**Step 6: Install deps and verify**

```bash
cd /home/nanoclaw/nanoclaw-apps && npm install && npx tsx src/index.ts &
sleep 2 && curl http://localhost:4000/health
# Expected: {"status":"ok"}
kill %1
```

**Step 7: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps
git add -A
git commit -m "feat: scaffold nanoclaw-apps companion service"
```

---

### Task 1.2: App registry (SQLite database)

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/src/db.ts`
- Create: `/home/nanoclaw/nanoclaw-apps/src/types.ts`

**Step 1: Create types**

```typescript
// src/types.ts
export interface App {
  name: string;
  repo_path: string;
  port: number;
  container_id: string | null;
  status: 'stopped' | 'building' | 'running' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Create db.ts with schema and CRUD**

```typescript
// src/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import type { App } from './types.js';

const DB_PATH = path.join(import.meta.dirname, '..', 'data', 'apps.db');

export function initDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      name TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      port INTEGER NOT NULL UNIQUE,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'stopped',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS port_allocations (
      port INTEGER PRIMARY KEY,
      app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE
    );
  `);
  return db;
}

export function createApp(db: Database.Database, app: Pick<App, 'name' | 'repo_path' | 'port'>): App {
  db.prepare(`INSERT INTO apps (name, repo_path, port) VALUES (?, ?, ?)`).run(app.name, app.repo_path, app.port);
  db.prepare(`INSERT INTO port_allocations (port, app_name) VALUES (?, ?)`).run(app.port, app.name);
  return getApp(db, app.name)!;
}

export function getApp(db: Database.Database, name: string): App | undefined {
  return db.prepare(`SELECT * FROM apps WHERE name = ?`).get(name) as App | undefined;
}

export function listApps(db: Database.Database): App[] {
  return db.prepare(`SELECT * FROM apps ORDER BY created_at`).all() as App[];
}

export function updateAppStatus(db: Database.Database, name: string, status: App['status'], containerId?: string | null, errorMessage?: string | null): void {
  db.prepare(`UPDATE apps SET status = ?, container_id = COALESCE(?, container_id), error_message = ?, updated_at = datetime('now') WHERE name = ?`)
    .run(status, containerId ?? null, errorMessage ?? null, name);
}

export function deleteApp(db: Database.Database, name: string): void {
  db.prepare(`DELETE FROM apps WHERE name = ?`).run(name);
}

export function getNextPort(db: Database.Database, rangeStart = 3001, rangeEnd = 3099): number {
  const used = db.prepare(`SELECT port FROM port_allocations ORDER BY port`).all() as { port: number }[];
  const usedSet = new Set(used.map(r => r.port));
  for (let p = rangeStart; p <= rangeEnd; p++) {
    if (!usedSet.has(p)) return p;
  }
  throw new Error(`No available ports in range ${rangeStart}-${rangeEnd}`);
}
```

**Step 3: Ensure data directory exists, verify DB creation**

```bash
mkdir -p /home/nanoclaw/nanoclaw-apps/data
cd /home/nanoclaw/nanoclaw-apps && npx tsx -e "import { initDatabase } from './src/db.js'; const db = initDatabase(); console.log('DB created');"
```

**Step 4: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: app registry with SQLite"
```

---

### Task 1.3: Container lifecycle manager

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/src/lifecycle.ts`

**Step 1: Create lifecycle.ts**

Manages Docker containers for apps using dockerode. Key functions:
- `buildApp(app)` — runs `docker build` on app's repo
- `startApp(app)` — creates and starts container, maps port
- `stopApp(app)` — stops and removes container
- `redeployApp(app)` — stop, rebuild, start
- `getContainerStats(containerId)` — CPU/memory from Docker API
- `getContainerLogs(containerId, tail)` — fetch recent logs

```typescript
// src/lifecycle.ts
import Docker from 'dockerode';
import type { App } from './types.js';

const docker = new Docker();

export async function buildApp(app: App): Promise<void> {
  const stream = await docker.buildImage(
    { context: app.repo_path, src: ['.'] },
    { t: `nanoclaw-app-${app.name}:latest` }
  );
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
  });
}

export async function startApp(app: App): Promise<string> {
  const container = await docker.createContainer({
    Image: `nanoclaw-app-${app.name}:latest`,
    name: `nanoclaw-app-${app.name}`,
    ExposedPorts: { [`${app.port}/tcp`]: {} },
    HostConfig: {
      PortBindings: { [`${app.port}/tcp`]: [{ HostPort: String(app.port) }] },
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Env: [`PORT=${app.port}`],
  });
  await container.start();
  return container.id;
}

export async function stopApp(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 10 });
  } catch (e: any) {
    if (!e.message?.includes('not running')) throw e;
  }
  try {
    await container.remove();
  } catch (e: any) {
    if (!e.message?.includes('No such container')) throw e;
  }
}

export async function getContainerStats(containerId: string): Promise<{ cpu_percent: number; memory_mb: number }> {
  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  return {
    cpu_percent: systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0,
    memory_mb: stats.memory_stats.usage / (1024 * 1024),
  };
}

export async function getContainerLogs(containerId: string, tail = 100): Promise<string> {
  const container = docker.getContainer(containerId);
  const logs = await container.logs({ stdout: true, stderr: true, tail, timestamps: true });
  return logs.toString();
}

export async function listRunningContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({ filters: { name: ['nanoclaw-app-'] } });
}
```

**Step 2: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: container lifecycle manager"
```

---

### Task 1.4: HTTP API routes

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/src/api.ts`
- Modify: `/home/nanoclaw/nanoclaw-apps/src/index.ts`

**Step 1: Create api.ts**

Express router implementing the API surface from the design doc:

```typescript
// src/api.ts
import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import * as db from './db.js';
import * as lifecycle from './lifecycle.js';
import { scaffold } from './scaffold.js'; // Task 1.6

export function createRouter(database: Database): Router {
  const router = Router();

  router.post('/apps', async (req, res) => {
    try {
      const { name, template } = req.body;
      if (!name || !/^[a-z0-9-]+$/.test(name)) {
        return res.status(400).json({ error: 'Invalid app name (lowercase alphanumeric and hyphens only)' });
      }
      const existing = db.getApp(database, name);
      if (existing) return res.status(409).json({ error: 'App already exists' });

      const port = db.getNextPort(database);
      const repoPath = `/home/nanoclaw/apps/${name}`;
      await scaffold(name, repoPath, template);
      const app = db.createApp(database, { name, repo_path: repoPath, port });
      res.status(201).json(app);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/apps', (_req, res) => {
    res.json(db.listApps(database));
  });

  router.get('/apps/:name', (req, res) => {
    const app = db.getApp(database, req.params.name);
    if (!app) return res.status(404).json({ error: 'App not found' });
    res.json(app);
  });

  router.post('/apps/:name/start', async (req, res) => {
    try {
      const app = db.getApp(database, req.params.name);
      if (!app) return res.status(404).json({ error: 'App not found' });

      db.updateAppStatus(database, app.name, 'building');
      await lifecycle.buildApp(app);
      const containerId = await lifecycle.startApp(app);
      db.updateAppStatus(database, app.name, 'running', containerId);
      res.json(db.getApp(database, app.name));
    } catch (e: any) {
      db.updateAppStatus(database, req.params.name, 'error', null, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/apps/:name/stop', async (req, res) => {
    try {
      const app = db.getApp(database, req.params.name);
      if (!app) return res.status(404).json({ error: 'App not found' });
      if (app.container_id) await lifecycle.stopApp(app.container_id);
      db.updateAppStatus(database, app.name, 'stopped', null);
      res.json(db.getApp(database, app.name));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/apps/:name/redeploy', async (req, res) => {
    try {
      const app = db.getApp(database, req.params.name);
      if (!app) return res.status(404).json({ error: 'App not found' });

      db.updateAppStatus(database, app.name, 'building');
      if (app.container_id) await lifecycle.stopApp(app.container_id);
      await lifecycle.buildApp(app);
      const containerId = await lifecycle.startApp(app);
      db.updateAppStatus(database, app.name, 'running', containerId);
      res.json(db.getApp(database, app.name));
    } catch (e: any) {
      db.updateAppStatus(database, req.params.name, 'error', null, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/apps/:name', async (req, res) => {
    try {
      const app = db.getApp(database, req.params.name);
      if (!app) return res.status(404).json({ error: 'App not found' });
      if (app.container_id) await lifecycle.stopApp(app.container_id);
      db.deleteApp(database, app.name);
      res.json({ deleted: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/apps/:name/logs', async (req, res) => {
    try {
      const app = db.getApp(database, req.params.name);
      if (!app || !app.container_id) return res.status(404).json({ error: 'No running container' });
      const logs = await lifecycle.getContainerLogs(app.container_id, Number(req.query.tail) || 100);
      res.type('text/plain').send(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
```

**Step 2: Update index.ts to use router and DB**

```typescript
// src/index.ts
import express from 'express';
import { initDatabase } from './db.js';
import { createRouter } from './api.js';
import fs from 'fs';

const app = express();
const PORT = 4000;

// Ensure data and apps directories exist
fs.mkdirSync('/home/nanoclaw/nanoclaw-apps/data', { recursive: true });
fs.mkdirSync('/home/nanoclaw/apps', { recursive: true });

const db = initDatabase();

app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', createRouter(db));

app.listen(PORT, () => {
  console.log(`nanoclaw-apps listening on :${PORT}`);
});
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: HTTP API routes for app management"
```

---

### Task 1.5: File watcher for auto-redeploy

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/src/watcher.ts`
- Modify: `/home/nanoclaw/nanoclaw-apps/src/index.ts`

**Step 1: Create watcher.ts**

Uses chokidar to watch `/home/nanoclaw/apps/` for git changes. Debounces rebuilds (5s) to avoid rapid-fire during multi-file commits.

```typescript
// src/watcher.ts
import { watch } from 'chokidar';
import type { Database } from 'better-sqlite3';
import * as db from './db.js';
import * as lifecycle from './lifecycle.js';

const DEBOUNCE_MS = 5000;
const timers = new Map<string, NodeJS.Timeout>();

export function startWatcher(database: Database, appsDir: string): void {
  const watcher = watch(appsDir, {
    ignoreInitial: true,
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    depth: 3,
  });

  watcher.on('all', (_event, filePath) => {
    // Extract app name from path: /home/nanoclaw/apps/{name}/...
    const relative = filePath.replace(appsDir + '/', '');
    const appName = relative.split('/')[0];
    if (!appName) return;

    const app = db.getApp(database, appName);
    if (!app || app.status !== 'running') return;

    // Debounce: only redeploy after 5s of no changes
    const existing = timers.get(appName);
    if (existing) clearTimeout(existing);

    timers.set(appName, setTimeout(async () => {
      timers.delete(appName);
      console.log(`[watcher] Changes detected in ${appName}, redeploying...`);
      try {
        db.updateAppStatus(database, appName, 'building');
        if (app.container_id) await lifecycle.stopApp(app.container_id);
        await lifecycle.buildApp(app);
        const containerId = await lifecycle.startApp(app);
        db.updateAppStatus(database, appName, 'running', containerId);
        console.log(`[watcher] ${appName} redeployed successfully`);
      } catch (e: any) {
        console.error(`[watcher] ${appName} redeploy failed:`, e.message);
        db.updateAppStatus(database, appName, 'error', null, e.message);
      }
    }, DEBOUNCE_MS));
  });

  console.log(`[watcher] Watching ${appsDir} for changes`);
}
```

**Step 2: Add watcher to index.ts**

Add after `app.listen()`:
```typescript
import { startWatcher } from './watcher.js';
// ...
startWatcher(db, '/home/nanoclaw/apps');
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: file watcher for auto-redeploy"
```

---

### Task 1.6: App scaffolding template

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/src/scaffold.ts`
- Create: `/home/nanoclaw/nanoclaw-apps/templates/default/` (template files)

**Step 1: Create scaffold.ts**

Generates a new app directory with a standard Node.js/React/Vite template:

```typescript
// src/scaffold.ts
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function scaffold(name: string, repoPath: string, _template = 'default'): Promise<void> {
  if (fs.existsSync(repoPath)) throw new Error(`Directory already exists: ${repoPath}`);
  fs.mkdirSync(repoPath, { recursive: true });

  // package.json
  fs.writeFileSync(path.join(repoPath, 'package.json'), JSON.stringify({
    name: `nanoclaw-app-${name}`,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'concurrently "tsx watch src/server/index.ts" "vite"',
      build: 'vite build && tsc -p tsconfig.server.json',
      start: 'node dist/server/index.js',
    },
    dependencies: {
      express: '^5.0.0',
      'better-sqlite3': '^11.0.0',
    },
    devDependencies: {
      '@types/express': '^5.0.0',
      '@types/better-sqlite3': '^7.6.0',
      '@types/node': '^22.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.0.0',
      autoprefixer: '^10.0.0',
      concurrently: '^9.0.0',
      postcss: '^8.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      'react-router-dom': '^7.0.0',
      tailwindcss: '^4.0.0',
      tsx: '^4.0.0',
      typescript: '^5.0.0',
      vite: '^6.0.0',
    },
  }, null, 2));

  // Dockerfile
  fs.writeFileSync(path.join(repoPath, 'Dockerfile'), `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["npm", "start"]
`);

  // tsconfig for server
  fs.writeFileSync(path.join(repoPath, 'tsconfig.server.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      outDir: 'dist/server', rootDir: 'src/server', strict: true, esModuleInterop: true,
    },
    include: ['src/server'],
  }, null, 2));

  // tsconfig for frontend
  fs.writeFileSync(path.join(repoPath, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      jsx: 'react-jsx', strict: true, esModuleInterop: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    },
    include: ['src/frontend'],
  }, null, 2));

  // Server entry
  fs.mkdirSync(path.join(repoPath, 'src/server'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'src/server/index.ts'), `import express from 'express';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());

// API routes
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(import.meta.dirname, '../../dist/frontend')));
  app.get('*', (_req, res) => res.sendFile(path.join(import.meta.dirname, '../../dist/frontend/index.html')));
}

app.listen(PORT, () => console.log(\`App listening on :\${PORT}\`));
`);

  // Frontend entry
  fs.mkdirSync(path.join(repoPath, 'src/frontend'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'src/frontend/main.tsx'), `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

createRoot(document.getElementById('root')!).render(<App />);
`);

  fs.writeFileSync(path.join(repoPath, 'src/frontend/App.tsx'), `export default function App() {
  return <div className="p-8"><h1 className="text-2xl font-bold">NanoClaw App: ${name}</h1></div>;
}
`);

  // Vite config
  fs.writeFileSync(path.join(repoPath, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  build: { outDir: '../../dist/frontend' },
  server: { proxy: { '/api': 'http://localhost:' + (process.env.PORT || 3001) } },
});
`);

  // index.html
  fs.writeFileSync(path.join(repoPath, 'src/frontend/index.html'), `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${name}</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
`);

  // CLAUDE.md
  fs.writeFileSync(path.join(repoPath, 'CLAUDE.md'), `# ${name}\n\nNanoClaw app. Built with React + Express + TypeScript.\n`);

  // .gitignore
  fs.writeFileSync(path.join(repoPath, '.gitignore'), 'node_modules/\ndist/\n*.db\n');

  // Init git repo
  execSync('git init && git add -A && git commit -m "init: scaffold from nanoclaw-apps"', { cwd: repoPath });
}
```

**Step 2: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: app scaffolding template"
```

---

### Task 1.7: Systemd service for nanoclaw-apps

**Files:**
- Create: `/home/nanoclaw/nanoclaw-apps/nanoclaw-apps.service`

**Step 1: Create systemd unit file**

```ini
[Unit]
Description=NanoClaw Apps Platform
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/home/nanoclaw/nanoclaw-apps
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

**Step 2: Install and enable**

```bash
mkdir -p ~/.config/systemd/user
cp /home/nanoclaw/nanoclaw-apps/nanoclaw-apps.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable nanoclaw-apps
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/nanoclaw-apps && git add -A && git commit -m "feat: systemd service unit"
```

---

## Phase 2: NanoClaw Core Integration

### Task 2.1: Agent-runner usage/context logging

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/container/agent-runner/src/index.ts`

**Reference:** The agent-runner calls Claude Code SDK's `query()` function. After each invocation, we write a metadata file with token usage.

**Step 1: Add usage metadata writing after agent output**

After the output marker is written (around the `emitOutput()` call), add code to write usage metadata:

```typescript
// Add to index.ts, after emitOutput() call
import fs from 'fs';
import path from 'path';

function writeUsageMetadata(groupFolder: string, data: {
  tokens_used: number;
  max_tokens: number;
  timestamp: string;
  session_id: string;
}): void {
  const dir = '/workspace/ipc/usage';
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
}
```

Hook this into the conversation result handler. The exact integration point depends on how the Claude Code SDK returns usage data — check `result.usage` or similar fields from the SDK response.

**Step 2: Update customisation notes**

Add to the nanoclaw project's docs or CLAUDE.md noting that `container/agent-runner/src/index.ts` has been customised with usage logging. This helps when merging upstream.

**Step 3: Commit**

```bash
cd /home/nanoclaw/nanoclaw && git add container/agent-runner/src/index.ts && git commit -m "feat: agent-runner writes usage metadata for telemetry"
```

---

### Task 2.2: Webapp channel adapter

**Files:**
- Create: `/home/nanoclaw/nanoclaw/src/channels/webapp.ts`
- Modify: `/home/nanoclaw/nanoclaw/src/channels/index.ts`

**Reference pattern:** Follow `src/channels/telegram.ts` exactly. The Channel interface is defined in `src/types.ts` lines 93-104.

**Step 1: Create webapp.ts**

```typescript
// src/channels/webapp.ts
import { WebSocket } from 'ws';
import { registerChannel } from './registry.js';
import type { Channel, ChannelOpts, NewMessage } from '../types.js';

const JID_PREFIX = 'webapp:';

class WebappChannel implements Channel {
  name = 'webapp';
  private ws: WebSocket | null = null;
  private opts: ChannelOpts;
  private wsUrl: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(wsUrl: string, opts: ChannelOpts) {
    this.opts = opts;
    this.wsUrl = wsUrl;
  }

  async connect(): Promise<void> {
    this.connectWs();
  }

  private connectWs(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[webapp] Connected to mission control');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') {
          const newMsg: NewMessage = {
            id: msg.id || `webapp-${Date.now()}`,
            chat_jid: `${JID_PREFIX}${msg.appName || 'mission-control'}`,
            sender: msg.sender || 'user',
            sender_name: msg.senderName || 'User',
            content: msg.content,
            timestamp: msg.timestamp || Date.now(),
          };
          this.opts.onMessage(newMsg.chat_jid, newMsg);
          this.opts.onChatMetadata(
            newMsg.chat_jid,
            newMsg.timestamp,
            msg.appName || 'mission-control',
            'webapp',
            false
          );
        }
      } catch (e) {
        console.error('[webapp] Failed to parse message:', e);
      }
    });

    this.ws.on('close', () => {
      console.log('[webapp] Disconnected, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connectWs(), 5000);
    });

    this.ws.on('error', (err) => {
      console.error('[webapp] WebSocket error:', err.message);
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'response',
      jid,
      text,
      timestamp: Date.now(),
    }));
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith(JID_PREFIX);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'typing', jid, isTyping }));
  }
}

// Self-register
registerChannel('webapp', (opts) => {
  const wsUrl = process.env.WEBAPP_WS_URL;
  if (!wsUrl) {
    console.warn('[webapp] WEBAPP_WS_URL not set, skipping');
    return null;
  }
  return new WebappChannel(wsUrl, opts);
});
```

**Step 2: Add import to src/channels/index.ts**

Add `import './webapp.js';` to the barrel file alongside the existing telegram import.

**Step 3: Add `ws` dependency if not already present**

```bash
cd /home/nanoclaw/nanoclaw && npm ls ws 2>/dev/null || npm install ws @types/ws
```

**Step 4: Add WEBAPP_WS_URL to .env.example or docs**

```
WEBAPP_WS_URL=ws://localhost:3001/ws/nanoclaw
```

**Step 5: Commit**

```bash
cd /home/nanoclaw/nanoclaw && git add src/channels/webapp.ts src/channels/index.ts && git commit -m "feat: webapp channel adapter for web-based apps"
```

---

### Task 2.3: /create-nanoclaw-app skill

**Files:**
- Create: `/home/nanoclaw/nanoclaw/.claude/skills/create-nanoclaw-app/SKILL.md`

**Step 1: Create skill file**

```markdown
---
name: create-nanoclaw-app
description: Create and manage NanoClaw apps via the companion service
---

# Create NanoClaw App

## When to use
When the user wants to create a new web application managed by the NanoClaw Apps platform, or manage existing apps (start, stop, redeploy, delete).

## Creating a new app

1. Ask the user for:
   - App name (lowercase, alphanumeric, hyphens only)
   - Brief description of what the app should do

2. Create the app via the companion service API:
   ```bash
   curl -X POST http://localhost:4000/api/apps \
     -H 'Content-Type: application/json' \
     -d '{"name": "APP_NAME"}'
   ```

3. The scaffold will be created at `/home/nanoclaw/apps/APP_NAME/`

4. Build and start the app:
   ```bash
   curl -X POST http://localhost:4000/api/apps/APP_NAME/start
   ```

5. The app will be accessible at `http://TAILSCALE_HOSTNAME:PORT`

## Managing apps

- List apps: `curl http://localhost:4000/api/apps`
- App details: `curl http://localhost:4000/api/apps/APP_NAME`
- Stop: `curl -X POST http://localhost:4000/api/apps/APP_NAME/stop`
- Redeploy: `curl -X POST http://localhost:4000/api/apps/APP_NAME/redeploy`
- Logs: `curl http://localhost:4000/api/apps/APP_NAME/logs`
- Delete: `curl -X DELETE http://localhost:4000/api/apps/APP_NAME`

## Modifying an app

To modify an existing app, edit files in `/home/nanoclaw/apps/APP_NAME/`, then commit:
```bash
cd /home/nanoclaw/apps/APP_NAME
git add -A && git commit -m "description of changes"
```
The file watcher will auto-redeploy the app within 5 seconds of the commit.

## App structure

Apps use React + Express + TypeScript:
```
apps/{name}/
├── src/server/index.ts    # Express API server
├── src/frontend/App.tsx   # React frontend entry
├── src/frontend/main.tsx  # React mount point
├── Dockerfile
└── CLAUDE.md              # App-specific memory
```
```

**Step 2: Commit**

```bash
cd /home/nanoclaw/nanoclaw && git add .claude/skills/create-nanoclaw-app/ && git commit -m "feat: /create-nanoclaw-app skill"
```

---

### Task 2.4: Update customisation documentation

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/docs/ARCHITECTURE.md`

**Step 1: Add customisation note about agent-runner changes**

Append to ARCHITECTURE.md:

```markdown
## Customisation Points

The following core files have local customisations that must be reviewed when merging upstream:

| File | Customisation | Purpose |
|------|--------------|---------|
| `container/agent-runner/src/index.ts` | Usage metadata logging | Writes token/context usage to `/workspace/ipc/usage/` after each run for Mission Control telemetry |

When pulling upstream changes, check these files for merge conflicts and ensure customisations are preserved.
```

**Step 2: Commit**

```bash
cd /home/nanoclaw/nanoclaw && git add docs/ARCHITECTURE.md && git commit -m "docs: add customisation tracking for agent-runner changes"
```

---

## Phase 3: Mission Control — Backend API

### Task 3.1: Scaffold Mission Control app

**Step 1: Use the companion service to scaffold**

```bash
# Start nanoclaw-apps temporarily
cd /home/nanoclaw/nanoclaw-apps && npx tsx src/index.ts &
sleep 2

# Create mission-control app
curl -X POST http://localhost:4000/api/apps \
  -H 'Content-Type: application/json' \
  -d '{"name": "mission-control"}'

kill %1
```

**Step 2: Install additional dependencies for mission control**

```bash
cd /home/nanoclaw/apps/mission-control
npm install ws better-sqlite3 @tanstack/react-query lucide-react
npm install -D @types/ws @dnd-kit/core @dnd-kit/sortable
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: scaffold with additional deps"
```

---

### Task 3.2: Dashboard API — NanoClaw status & containers

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/dashboard.ts`

**Step 1: Create dashboard routes**

Endpoints:
- `GET /api/dashboard/status` — NanoClaw service status (systemd), uptime, CPU, memory
- `GET /api/dashboard/containers` — active NanoClaw agent containers from Docker API
- `GET /api/dashboard/channels` — parse channel status from NanoClaw (read registered groups from DB, check container names)
- `POST /api/dashboard/service/:action` — start/stop/restart NanoClaw via systemd

```typescript
// src/server/routes/dashboard.ts
import { Router } from 'express';
import { execSync } from 'child_process';
import Docker from 'dockerode';
import Database from 'better-sqlite3';

const docker = new Docker();
const NANOCLAW_DB = '/home/nanoclaw/nanoclaw/store/messages.db';

export function dashboardRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    try {
      const status = execSync('systemctl --user is-active nanoclaw', { encoding: 'utf8' }).trim();
      const uptime = execSync('systemctl --user show nanoclaw --property=ActiveEnterTimestamp', { encoding: 'utf8' }).trim();
      res.json({ status, uptime: uptime.split('=')[1] });
    } catch {
      res.json({ status: 'inactive', uptime: null });
    }
  });

  router.get('/containers', async (_req, res) => {
    try {
      const containers = await docker.listContainers({
        filters: { name: ['nanoclaw-'] },
      });
      res.json(containers.map(c => ({
        id: c.Id.slice(0, 12),
        name: c.Names[0]?.replace('/', ''),
        image: c.Image,
        status: c.Status,
        created: c.Created,
        state: c.State,
      })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/channels', (_req, res) => {
    try {
      const db = new Database(NANOCLAW_DB, { readonly: true });
      const groups = db.prepare('SELECT * FROM registered_groups').all();
      db.close();
      res.json(groups);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/service/:action', (req, res) => {
    const { action } = req.params;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    try {
      execSync(`systemctl --user ${action} nanoclaw`, { encoding: 'utf8' });
      res.json({ success: true, action });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
```

**Step 2: Wire into server/index.ts**

```typescript
import { dashboardRouter } from './routes/dashboard.js';
app.use('/api/dashboard', dashboardRouter());
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: dashboard API — status, containers, channels, service control"
```

---

### Task 3.3: Context window telemetry API

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/telemetry.ts`

**Step 1: Create telemetry routes**

Reads usage metadata files written by agent-runner (from Task 2.1) and session files to estimate context window usage.

- `GET /api/telemetry/sessions` — list active sessions with context size estimates
- `GET /api/telemetry/usage` — aggregated token usage per group, with cost estimates

```typescript
// src/server/routes/telemetry.ts
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = '/home/nanoclaw/nanoclaw/data/sessions';
const IPC_DIR = '/home/nanoclaw/nanoclaw/data/ipc';

export function telemetryRouter(): Router {
  const router = Router();

  router.get('/sessions', (_req, res) => {
    try {
      const groups = fs.readdirSync(SESSIONS_DIR).filter(f =>
        fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory()
      );
      const sessions = groups.map(group => {
        const claudeDir = path.join(SESSIONS_DIR, group, '.claude');
        const projectDir = path.join(claudeDir, 'projects');
        let sessionSize = 0;
        let sessionFile = '';

        // Find latest session file
        if (fs.existsSync(projectDir)) {
          for (const proj of fs.readdirSync(projectDir)) {
            const projPath = path.join(projectDir, proj);
            if (!fs.statSync(projPath).isDirectory()) continue;
            for (const f of fs.readdirSync(projPath)) {
              if (f.endsWith('.jsonl')) {
                const size = fs.statSync(path.join(projPath, f)).size;
                if (size > sessionSize) {
                  sessionSize = size;
                  sessionFile = f;
                }
              }
            }
          }
        }

        return {
          group,
          session_file: sessionFile,
          session_size_bytes: sessionSize,
          session_size_mb: +(sessionSize / (1024 * 1024)).toFixed(2),
          max_size_mb: 2, // Session auto-resets at 2MB
          compaction_pct: +((sessionSize / (2 * 1024 * 1024)) * 100).toFixed(1),
        };
      });
      res.json(sessions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/usage', (req, res) => {
    try {
      const { group, days } = req.query;
      const cutoff = Date.now() - (Number(days) || 7) * 86400000;
      const results: any[] = [];

      const groupDirs = group
        ? [String(group)]
        : fs.readdirSync(IPC_DIR).filter(f => fs.statSync(path.join(IPC_DIR, f)).isDirectory());

      for (const g of groupDirs) {
        const usageDir = path.join(IPC_DIR, g, 'usage');
        if (!fs.existsSync(usageDir)) continue;

        let totalTokens = 0;
        let count = 0;

        for (const f of fs.readdirSync(usageDir)) {
          if (!f.endsWith('.json')) continue;
          const ts = parseInt(f.replace('.json', ''));
          if (ts < cutoff) continue;

          try {
            const data = JSON.parse(fs.readFileSync(path.join(usageDir, f), 'utf8'));
            totalTokens += data.tokens_used || 0;
            count++;
          } catch { /* skip corrupt files */ }
        }

        results.push({
          group: g,
          total_tokens: totalTokens,
          invocations: count,
          estimated_cost_usd: +(totalTokens * 0.000015).toFixed(4), // rough estimate
        });
      }

      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
```

**Step 2: Wire into server**

```typescript
import { telemetryRouter } from './routes/telemetry.js';
app.use('/api/telemetry', telemetryRouter());
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: telemetry API — sessions, usage, context window"
```

---

### Task 3.4: Agent Memory & Skills Browser API

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/memory.ts`
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/skills.ts`

**Step 1: Create memory routes**

- `GET /api/memory/groups` — list all groups with their CLAUDE.md paths
- `GET /api/memory/file?path=...` — read a memory/ToME file (validated to be within allowed dirs)
- `PUT /api/memory/file?path=...` — write updated content (body: `{ content: string }`)

Path validation: only allow reads/writes under `groups/` directory in nanoclaw.

**Step 2: Create skills routes**

- `GET /api/skills/tree` — returns file tree of all skills across three levels:
  - Host: `.claude/skills/*/SKILL.md`
  - Container: `container/skills/*/SKILL.md`
  - Per-group: `groups/*/skills/` (if they exist)
- `GET /api/skills/file?path=...` — read skill file content
- `PUT /api/skills/file?path=...` — write skill file content

Path validation: only allow paths under nanoclaw project root, ending in `.md`.

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: memory and skills browser API"
```

---

### Task 3.5: Scheduled Tasks API

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/tasks.ts`

**Step 1: Create task routes**

Read from NanoClaw's SQLite DB (read-only for listing, but write for pause/resume/cancel since the DB is shared):

- `GET /api/tasks` — list all scheduled tasks with last run info
- `GET /api/tasks/:id/logs` — task run history from `task_run_logs`
- `POST /api/tasks` — create new task (insert into `scheduled_tasks`)
- `POST /api/tasks/:id/pause` — set status = 'paused'
- `POST /api/tasks/:id/resume` — set status = 'active', recalculate next_run
- `POST /api/tasks/:id/cancel` — set status = 'cancelled'

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: scheduled tasks API"
```

---

### Task 3.6: Message Log API

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/messages.ts`

**Step 1: Create message routes**

- `GET /api/messages?group=&sender=&search=&from=&to=&limit=&offset=` — paginated, filterable message log
- `GET /api/messages/groups` — list groups with message counts

Both read from NanoClaw's `store/messages.db` read-only.

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: message log API"
```

---

### Task 3.7: To-Do List API

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/todos.ts`
- Create: `/home/nanoclaw/apps/mission-control/src/server/db.ts`

**Step 1: Create mission-control's own SQLite database**

Schema:

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, cancelled
  due_date TEXT,
  tags TEXT, -- JSON array
  assigned_group TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, blocked
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Create CRUD routes**

- `GET /api/todos?status=&priority=&tag=&group=` — filtered list with subtasks
- `POST /api/todos` — create todo
- `PUT /api/todos/:id` — update todo
- `DELETE /api/todos/:id` — delete todo
- `PUT /api/todos/reorder` — batch update sort_order
- `POST /api/todos/:id/subtasks` — add subtask
- `PUT /api/todos/:todoId/subtasks/:id` — update subtask status
- `DELETE /api/todos/:todoId/subtasks/:id` — delete subtask

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: to-do list API with subtasks"
```

---

### Task 3.8: App Management API (proxy to companion service)

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/apps.ts`

**Step 1: Create proxy routes**

Thin proxy to the nanoclaw-apps companion service at `localhost:4000`:

- `GET /api/apps` → `GET localhost:4000/api/apps`
- `POST /api/apps` → `POST localhost:4000/api/apps`
- `POST /api/apps/:name/start` → proxy
- `POST /api/apps/:name/stop` → proxy
- `POST /api/apps/:name/redeploy` → proxy
- `DELETE /api/apps/:name` → proxy
- `GET /api/apps/:name/logs` → proxy

Use `fetch()` (built into Node 22) to forward requests.

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: app management API proxying to companion service"
```

---

### Task 3.9: WebSocket server for realtime updates & chat

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/ws.ts`
- Modify: `/home/nanoclaw/apps/mission-control/src/server/index.ts`

**Step 1: Create WebSocket server**

Two concerns:
1. **Telemetry broadcast** — push container stats, service status every 5s to connected dashboards
2. **Chat channel** — receive user messages, forward agent responses. This is the endpoint that NanoClaw's `webapp.ts` channel adapter connects to.

```typescript
// src/server/ws.ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

export function setupWebSocket(server: Server): void {
  // Dashboard telemetry
  const dashboardWss = new WebSocketServer({ server, path: '/ws/dashboard' });

  // NanoClaw channel connection
  const nanoclawWss = new WebSocketServer({ server, path: '/ws/nanoclaw' });

  // Chat clients (browser)
  const chatWss = new WebSocketServer({ server, path: '/ws/chat' });

  // Bridge: chat client messages → nanoclaw channel → agent → nanoclaw channel → chat clients
  chatWss.on('connection', (chatClient) => {
    chatClient.on('message', (data) => {
      // Forward user message to NanoClaw channel
      nanoclawWss.clients.forEach(nc => {
        if (nc.readyState === WebSocket.OPEN) {
          nc.send(data.toString());
        }
      });
    });
  });

  nanoclawWss.on('connection', (ncClient) => {
    ncClient.on('message', (data) => {
      // Forward agent response to all chat clients
      chatWss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      });
    });
  });

  // Telemetry broadcast loop
  setInterval(async () => {
    if (dashboardWss.clients.size === 0) return;
    // Gather telemetry and broadcast
    const telemetry = JSON.stringify({ type: 'telemetry', timestamp: Date.now() });
    dashboardWss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(telemetry);
    });
  }, 5000);
}
```

**Step 2: Integrate with Express server**

```typescript
import { createServer } from 'http';
import { setupWebSocket } from './ws.js';

const server = createServer(app);
setupWebSocket(server);
server.listen(PORT, () => console.log(`Mission Control on :${PORT}`));
```

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: WebSocket server for telemetry and chat"
```

---

## Phase 4: Mission Control — Frontend

### Task 4.1: Frontend foundation — layout, routing, Tailwind

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/App.tsx`
- Create: `/home/nanoclaw/apps/mission-control/src/frontend/layouts/MainLayout.tsx`
- Create: `/home/nanoclaw/apps/mission-control/src/frontend/pages/` (one file per page, initially stubs)

**Step 1: Set up React Router with sidebar navigation**

Pages to create as stubs:
- `DashboardPage.tsx`
- `MemoryPage.tsx`
- `SkillsPage.tsx`
- `TasksPage.tsx`
- `MessagesPage.tsx`
- `ChatPage.tsx`
- `TodosPage.tsx`
- `AppsPage.tsx`
- `UsagePage.tsx`

**Step 2: MainLayout with sidebar**

Sidebar with navigation links (use lucide-react icons): Dashboard, Agent Memory, Skills, Scheduled Tasks, Messages, Chat, To-Dos, Apps, Usage.

**Step 3: Set up TanStack Query provider for data fetching**

**Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: frontend layout, routing, page stubs"
```

---

### Task 4.2: Dashboard page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/DashboardPage.tsx`

**Features:**
- Service status card with start/stop/restart buttons
- Channel status cards (connected/disconnected indicators)
- Active containers table with group name, status, uptime
- Context window gauges — progress bars showing session size vs 2MB limit, color-coded (green < 50%, yellow 50-80%, red > 80%)
- Auto-refresh via WebSocket telemetry

**Step 1: Build the page using TanStack Query hooks to fetch from `/api/dashboard/*` and `/api/telemetry/sessions`**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: dashboard page with status, containers, context gauges"
```

---

### Task 4.3: Agent Memory page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/MemoryPage.tsx`
- Create: `/home/nanoclaw/apps/mission-control/src/frontend/components/MarkdownEditor.tsx`

**Features:**
- Left panel: file tree of groups, global, and ToME files
- Right panel: markdown preview + raw edit toggle
- Save button that PUTs to `/api/memory/file`

**Step 1: Build file tree component that fetches from `/api/memory/groups`**

**Step 2: Build MarkdownEditor component (textarea + preview toggle)**

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: agent memory page with markdown editor"
```

---

### Task 4.4: Skills Browser page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/SkillsPage.tsx`

**Features:**
- Three-section file tree: Host Skills, Container Skills, Per-Group Skills
- Reuses MarkdownEditor component from Task 4.3
- Click skill → view/edit in right panel

**Step 1: Fetch skill tree from `/api/skills/tree`, render with collapsible sections**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: skills browser page"
```

---

### Task 4.5: Scheduled Tasks page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/TasksPage.tsx`

**Features:**
- Table: task name, group, schedule, status, last run, next run
- Action buttons: pause/resume/cancel
- Expandable row showing run history from `/api/tasks/:id/logs`
- Create task form (group, prompt, schedule type, schedule value)

**Step 1: Build table with TanStack Query, action buttons with mutations**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: scheduled tasks page"
```

---

### Task 4.6: Message Log page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/MessagesPage.tsx`

**Features:**
- Filter bar: group dropdown, sender text, search text, date range
- Paginated message list with sender, content preview, timestamp
- Click to expand full message

**Step 1: Build with filters as URL params, paginated fetch from `/api/messages`**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: message log page"
```

---

### Task 4.7: Chat Interface page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/ChatPage.tsx`

**Features:**
- Chat window with message bubbles (user on right, agent on left)
- Input box with send button
- Typing indicator when agent is processing
- WebSocket connection to `/ws/chat`
- Streaming display of agent responses

**Step 1: Build chat UI with WebSocket hook**

```typescript
// useChat hook
function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws/chat`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'response') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text, timestamp: data.timestamp }]);
        setIsTyping(false);
      } else if (data.type === 'typing') {
        setIsTyping(data.isTyping);
      }
    };
    return () => ws.close();
  }, []);

  const sendMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content, timestamp: Date.now() }]);
    wsRef.current?.send(JSON.stringify({
      type: 'message',
      content,
      sender: 'user',
      senderName: 'User',
      appName: 'mission-control',
    }));
  };

  return { messages, isTyping, sendMessage };
}
```

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: chat interface page with WebSocket"
```

---

### Task 4.8: To-Do List page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/TodosPage.tsx`
- Create: `/home/nanoclaw/apps/mission-control/src/frontend/components/TodoCard.tsx`

**Features:**
- Card grid/list view of to-dos
- Each card shows: title, priority badge, due date, progress bar (completed subtasks / total)
- Expand card to see/edit subtasks with status toggles
- Create todo modal with title, description, priority, due date, tags
- Add subtasks inline
- Filter bar: status, priority, tag, assigned group
- Drag-and-drop reordering with @dnd-kit

**Step 1: Build TodoCard component**

**Step 2: Build TodosPage with grid layout, filters, create modal**

**Step 3: Add drag-and-drop with @dnd-kit/sortable**

**Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: to-do list page with cards, subtasks, drag-and-drop"
```

---

### Task 4.9: App Management page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/AppsPage.tsx`

**Features:**
- Table of apps: name, port, status, uptime
- Action buttons: start, stop, redeploy, delete (with confirmation)
- Create app form (name input)
- Expandable log viewer per app

**Step 1: Build with TanStack Query fetching from `/api/apps`**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: app management page"
```

---

### Task 4.10: Cost & Usage page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/UsagePage.tsx`

**Features:**
- Period selector: 7d, 30d, 90d
- Table: group, total tokens, invocations, estimated cost
- Summary row with totals

**Step 1: Fetch from `/api/telemetry/usage?days=N`, render table**

**Step 2: Commit**

```bash
cd /home/nanoclaw/apps/mission-control && git add -A && git commit -m "feat: cost and usage page"
```

---

## Phase 5: Integration & Deployment

### Task 5.1: Register Mission Control as a NanoClaw group

**Step 1: Add WEBAPP_WS_URL to NanoClaw's .env**

```
WEBAPP_WS_URL=ws://localhost:3001/ws/nanoclaw
```

**Step 2: Register mission-control as a group**

Either via the main group agent or by directly inserting into the DB:
```bash
cd /home/nanoclaw/nanoclaw
npx tsx -e "
import { initDatabase, registerGroup } from './src/db.js';
const db = initDatabase();
db.prepare('INSERT OR IGNORE INTO registered_groups (jid, name, folder, trigger_pattern, requires_trigger, is_main) VALUES (?, ?, ?, ?, ?, ?)')
  .run('webapp:mission-control', 'Mission Control', 'mission-control', null, 0, 0);
"
```

**Step 3: Create the group folder**

```bash
mkdir -p /home/nanoclaw/nanoclaw/groups/mission-control
echo "# Mission Control\n\nWeb-based dashboard and chat interface for NanoClaw." > /home/nanoclaw/nanoclaw/groups/mission-control/CLAUDE.md
```

**Step 4: Commit**

```bash
cd /home/nanoclaw/nanoclaw && git add groups/mission-control/ && git commit -m "feat: register mission-control as NanoClaw group"
```

---

### Task 5.2: Build and deploy

**Step 1: Build companion service**

```bash
cd /home/nanoclaw/nanoclaw-apps && npm run build
systemctl --user start nanoclaw-apps
```

**Step 2: Build and start mission control via companion service**

```bash
curl -X POST http://localhost:4000/api/apps/mission-control/start
```

**Step 3: Restart NanoClaw to pick up webapp channel**

```bash
systemctl --user restart nanoclaw
```

**Step 4: Verify**

```bash
# Check companion service
curl http://localhost:4000/health

# Check mission control
curl http://localhost:3001/api/health

# Check NanoClaw logs for webapp channel connection
journalctl --user -u nanoclaw --since "1 minute ago" | grep webapp
```

---

### Task 5.3: End-to-end smoke test

**Step 1: Open mission control in browser**

Navigate to `http://TAILSCALE_HOSTNAME:3001` and verify:
- Dashboard loads with NanoClaw status
- Channels show as connected
- Container list populates

**Step 2: Test chat**

Send a message through the chat interface. Verify:
- Message appears in chat window
- NanoClaw spawns a container for the mission-control group
- Agent response streams back to the UI

**Step 3: Test to-do CRUD**

Create a to-do, add subtasks, change statuses, reorder.

**Step 4: Test app management**

View mission-control in the apps list. Verify status shows as running.

---

## Dependency Graph

```
Phase 1 (companion service)    Phase 2 (core integration)
  1.1 → 1.2 → 1.3               2.1 (agent-runner logging)
         ↓     ↓                 2.2 (webapp channel) → depends on 3.9
  1.4 (API) ← 1.6 (scaffold)    2.3 (skill)
         ↓                       2.4 (docs)
  1.5 (watcher)
  1.7 (systemd)

Phase 3 (MC backend)           Phase 4 (MC frontend)
  3.1 (scaffold) ← needs 1.4    4.1 (layout) ← needs 3.1
  3.2-3.8 (route files)         4.2-4.10 (pages) ← need 3.2-3.8
  3.9 (WebSocket)

Phase 5 (integration)
  5.1-5.3 ← needs all above
```

**Phases 1 and 2 can be built in parallel.** Phase 3 depends on 1.4 (for scaffolding). Phase 4 depends on Phase 3 (API must exist for frontend to fetch). Phase 5 ties everything together.

---

## Notes

- **Testing approach:** Given the integration-heavy nature (Docker, systemd, filesystem), prefer manual smoke tests over unit tests for Phase 1. The companion service API and mission control API routes can be tested with curl scripts. Frontend testing via browser.
- **Iterative refinement:** The frontend pages (Phase 4) are described at feature level. The implementing agent should use its judgement on exact component structure, styling, and UX details — the design doc specifies *what*, not pixel-perfect *how*.
- **Agent-runner changes (Task 2.1):** This is the only modification to upstream-tracked code. Keep it minimal and well-documented.
