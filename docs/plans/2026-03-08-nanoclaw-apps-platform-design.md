# NanoClaw Apps Platform — Design

## Overview

Extend NanoClaw from an "AI agent engine" to an "app platform" — enabling NanoClaw to create, run, and manage full-stack web applications on the same VPS. Apps are managed by a companion service, integrate with NanoClaw agents via skills and IPC, and can be self-modified by ephemeral agents.

The first app is **Mission Control** — a feature-rich dashboard and chat interface for managing the NanoClaw instance.

## System Architecture

Three independent repos on the same VPS:

```
/home/nanoclaw/
├── nanoclaw/              # Core engine (upstream-mergeable)
├── nanoclaw-apps/         # Companion service (app platform)
└── apps/
    └── mission-control/   # First app
```

### Why separate repos

- NanoClaw core stays cleanly mergeable with upstream
- Companion service and apps have independent git history and deployment
- Integration is through skills, IPC, and a thin channel adapter — not shared code

### Communication flow

```
NanoClaw Core ──(skills + IPC)──► NanoClaw Apps ──(Docker API)──► App Containers
                                       │
                                       ▼
                                 Tailscale:PORT ──► User's browser
```

## Companion Service (nanoclaw-apps)

Node.js/TypeScript process running as a systemd service alongside NanoClaw.

### Responsibilities

- **App registry** — SQLite database tracking apps: name, repo path, port, container ID, status, created date
- **Container lifecycle** — build image from app's Dockerfile, start/stop/restart containers, health checks
- **Port allocator** — assigns ports from range 3001-3099, tracks allocation in registry
- **File watcher** — watches app repo directories for git changes, triggers rebuild + redeploy
- **HTTP API** — local REST API for managing apps

### API surface

```
POST   /apps                 — create new app (name, template)
GET    /apps                 — list all apps
GET    /apps/:name           — app details (status, port, logs)
POST   /apps/:name/start     — start app container
POST   /apps/:name/stop      — stop app container
POST   /apps/:name/redeploy  — rebuild and restart
DELETE /apps/:name           — remove app entirely
GET    /apps/:name/logs      — stream container logs
```

### Auto-redeploy flow

```
Git push to apps/{name}/
  → file watcher detects change
  → docker build
  → stop old container
  → start new container on same port
  → health check
  → done (or rollback to previous image on failure)
```

### App template

When `/create-nanoclaw-app` is invoked, the companion service scaffolds:

```
apps/{name}/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Express server entry
│   ├── routes/           # API routes
│   └── frontend/         # React app (Vite)
├── CLAUDE.md             # App-specific agent memory
└── .gitignore
```

## Mission Control App

### Stack

- **Frontend:** React + TypeScript, Vite, Tailwind CSS
- **Backend:** Express.js API server (same container)
- **Database:** SQLite (for to-dos and app-specific state)
- **Realtime:** WebSocket for live telemetry updates
- **Port:** 3001 (first allocated port)

### Features

#### Dashboard (home page)
- NanoClaw service status (running/stopped, uptime, memory/CPU usage)
- Start/stop/restart NanoClaw service controls
- Channel status — which channels are connected with connection health
- Active containers — list of running agent containers with group name, uptime, status
- Per-session context window gauge — current tokens vs max, visual indicator when compaction is near

#### Agent Memory
- Browse and edit all groups' `CLAUDE.md` files
- View/edit `global/CLAUDE.md`
- ToME mental model files — view/edit files in `groups/global/tome/`
- Markdown preview + raw edit mode

#### Skills Browser
- File tree navigator showing three skill levels:
  - Host skills (`.claude/skills/*/SKILL.md`)
  - Container skills (`container/skills/*/SKILL.md`)
  - Per-group skills (synced copies in group directories)
- Click to view, edit inline with markdown preview

#### Scheduled Tasks
- Table of all tasks: group, schedule, status, last run, next run
- Create new tasks (cron or interval)
- Pause/resume/cancel tasks
- Run history with logs

#### Message Log
- Searchable, filterable message history across all groups
- Filter by channel, group, sender, date range
- View full conversation threads

#### Chat Interface
- Registers as a NanoClaw group (like Telegram)
- Send messages, receive agent responses
- Streaming output display
- Ephemeral agent model — same as messaging channels

#### To-Do List
- Card-based to-dos (not table rows)
- Each to-do has: title, description, priority, due date, tags
- Nested sub-tasks — a checklist of steps to achieve the to-do
- Each sub-task has its own status (pending / in-progress / completed / blocked)
- Maps to how agents plan work — decompose into tasks, update status as they execute
- Filter/sort by status, priority, tag, assignee (group)
- Drag-and-drop reordering

#### App Management
- List all running apps (port, status, uptime)
- Start/stop/redeploy apps
- View app logs
- Create new app (invokes `/create-nanoclaw-app` flow)

#### Cost & Usage
- Anthropic API token usage per group, per session
- Daily/weekly/monthly aggregation
- Cost estimates based on token counts

## Integration Points

### Dashboard reads (direct access)
- Filesystem: group CLAUDE.md files, ToME models, skills, session files
- SQLite: NanoClaw's `store/messages.db` (read-only) for messages, tasks, groups
- Docker API: container status, resource usage
- systemd: NanoClaw service status

### Chat writes (channel adapter)
- New file `src/channels/webapp.ts` in NanoClaw core
- Connects to mission control's WebSocket
- Messages flow through NanoClaw's existing message pipeline (trigger detection, group queuing, container spawning)

### Service control
- systemd commands for start/stop/restart NanoClaw

### App management
- Companion service HTTP API

### Agent builds apps
- NanoClaw agent container with app repo mounted as writable volume
- Git-based workflow: agent commits changes, auto-redeploy triggers

### Context/usage telemetry
- Agent-runner writes metadata files after each run: `{tokens_used, max_tokens, timestamp}`
- Mission control reads these files for gauges and cost tracking

## Changes to NanoClaw Core

| Change | Type | Merge risk |
|--------|------|------------|
| `src/channels/webapp.ts` | New file | None — additive |
| Agent-runner usage/context logging | Small addition | Low — document in customisation notes |
| `/create-nanoclaw-app` skill | New skill file | None — additive |

**Note:** Agent-runner changes should be tracked as a customisation point. When merging upstream updates to `container/agent-runner/`, review these additions carefully.

## Agent Model

- **Ephemeral containers** — same model as messaging channels. No persistent agent processes.
- **Build agent** — invoked to modify an app's code. Edits repo, commits, auto-redeploy handles the rest.
- **Runtime agent** — invoked through the chat interface when user wants intelligence. App handles normal UI interactions itself.
- If a specific app needs a bespoke persistent agent, that's the app's own concern — built into its codebase, separate from NanoClaw.

## Networking

- Apps accessed via Tailscale: `nanoclaw-vps:PORT`
- No public exposure, no SSL needed (Tailscale handles encryption)
- No reverse proxy needed initially — direct port access
- Caddy can be added later if public access or nicer URLs are wanted

## Security

- Apps run in Docker containers with the same isolation model as NanoClaw agents
- Tailscale restricts access to devices on the tailnet
- Mission control's service control (start/stop NanoClaw) requires careful auth consideration — initially, Tailscale access is the auth boundary
