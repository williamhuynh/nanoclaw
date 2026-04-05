# NanoClaw Customizations

Local modifications to the core NanoClaw engine. Referenced by `/update-nanoclaw` during merge conflict resolution to preserve intentional changes.

## Format

Each entry: **what** was changed, **why**, and **which files** were modified.

---

## Session auto-reset on "Prompt is too long" (2026-03-08)

**Problem:** Long coding sessions accumulate messages in the Claude Code session file. Even with compaction, the prompt eventually exceeds the context limit. Once stuck, every retry resumes the bloated session — infinite failure loop.

**Changes:**

- `container/agent-runner/src/index.ts`: Detect "Prompt is too long" result, delete the session `.jsonl` file and directory, retry with a fresh session. If it fails on a fresh session too (system prompt too large), exit with error.
- `src/index.ts`: Proactive session file size check before running the container — if the `.jsonl` exceeds 2MB, delete it and start fresh. Also clears host-side session (in-memory + DB) when container returns "Prompt is too long" error.
- `src/db.ts`: Added `deleteSession()` function.

---

## Agent-to-agent delegation system (2026-03-13)

**Purpose:** Main group agent can delegate work to specialist agents (e.g. LinkedIn agent) and wait for results. Enables multi-agent workflows.

**Changes:**

- `src/ipc.ts`: Added `delegate` case to `processTaskIpc`, `runDelegation` to `IpcDeps`, `sendPhoto` handler for IPC photo messages with container-to-host path resolution.
- `src/index.ts`: Wires `runDelegation` into IPC deps — runs a container agent in the target group and collects output. Also wires `sendPhoto` IPC dep.
- `src/types.ts`: Added `sendPhoto` to `Channel` interface.

---

## Event telemetry for Mission Control (2026-03-13)

**Purpose:** Emit structured events (message stored, container start/complete, delegation start/complete) so the Mission Control dashboard can display real-time activity.

**Changes:**

- `src/events.ts`: New file — `emitEvent()` writes JSON files to `data/events/` atomically.
- `src/container-runner.ts`: Emits `container_started` and `container_completed` events.
- `src/ipc.ts`: Emits `delegation_started` and `delegation_completed` events.
- `src/index.ts`: Emits `message_stored` events on inbound and outbound messages.

---

## ToME mental model mounts (2026-03-09)

**Purpose:** Mount the ToME (Theory of Mind Engine) directory into containers so agents can read/write the mental model and use ToME skills.

**Changes:**

- `src/config.ts`: Added `TOME_DIR` export (defaults to `~/tome`, override via `TOME_DIR` env var).
- `src/container-runner.ts`: Mounts `TOME_DIR` at `/workspace/global/tome` (read-write) for both main and non-main groups. Syncs ToME skills from `TOME_DIR/skills/` into container skills directory.

---

## Email channel (Gmail) (2026-03-01)

**Purpose:** Agents can receive and reply to emails via Gmail MCP integration.

**Changes:**

- `src/email-channel.ts`: New file — Gmail polling, reply sending, MCP client lifecycle.
- `src/config.ts`: Added `EMAIL_CHANNEL` config block (trigger mode, poll interval, etc).
- `src/types.ts`: Added `EmailChannelConfig` interface.
- `src/db.ts`: Added `processed_emails` table and `isEmailProcessed`, `markEmailProcessed`, `markEmailResponded` functions.
- `src/index.ts`: Added email processing loop (`startEmailLoop`, `processEmail`).

---

## Extra container mounts (2026-03-08)

**Purpose:** Mount Mission Control app source and Gmail credentials into containers.

**Changes:**

- `src/container-runner.ts`: Mounts `~/apps/mission-control` at `/workspace/mission-control` (read-write) and `~/.gmail-mcp` at `/home/node/.gmail-mcp` (read-write for token refresh).

---

## Telegram channel config in core (2026-03-01)

**Purpose:** Read Telegram bot token and TELEGRAM_ONLY flag from .env at startup.

**Changes:**

- `src/config.ts`: Added `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ONLY` exports, added both keys to `readEnvFile` call.

---

## HTTP API bridge for external access (2026-03-28)

**Purpose:** REST API on port 3004 so external AI agents, dashboards, and scripts can interact with NanoClaw. Authenticated via bearer token, bridges to existing IPC system.

**Changes:**

- `src/api.ts`: New file — HTTP server with endpoints for status, groups, chats, tasks CRUD, messages, send message, and delegation.
- `src/config.ts`: Added `API_PORT` (default 3004) and `API_HOST` (default 0.0.0.0).
- `src/index.ts`: Starts API server on boot, includes in graceful shutdown.

---

## SSH keys and git config in containers (2026-03-28)

**Purpose:** Enable containers to `git commit && git push` via SSH. Used by ToME auto-sync (tome-observe skill commits and pushes after each observation).

**Changes:**

- `src/container-runner.ts`: Mounts `~/.ssh` read-only at `/home/node/.ssh` in `buildVolumeMounts`. Sets `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` env vars in `buildContainerArgs`.

**Security notes:** SSH keys are read-only. This bypasses the mount-security.ts blocklist (which only applies to user-configured `additionalMounts`, not hardcoded mounts). All containers get SSH access — scope down to specific groups if needed later.

---

## MCP todo tools for container agents (2026-03-29)

**Purpose:** Agents can create, list, update, and manage todos in Mission Control via MCP tools. Also proxies todo API through NanoClaw's external API (port 3004).

**Changes:**

- `container/agent-runner/src/ipc-mcp-stdio.ts`: Added `mcFetch` HTTP helper (routes through credential proxy port 3001), `mcToolCall` response wrapper, and 6 MCP tools (todo_list, todo_get, todo_create, todo_update, subtask_create, subtask_update).
- `src/credential-proxy.ts`: Added `/api/todos/*` proxy that forwards to Mission Control on localhost:3002. Required because containers can only reach host port 3001 on this VPS.
- `src/api.ts`: Added `/api/todos/*` proxy that forwards authenticated requests from port 3004 to Mission Control port 3002 (for external access via Cloudflare).
- `container/skills/todo-brain-dump/SKILL.md`: New skill — instructs agents to parse natural language brain dumps into structured todos via MCP tools.

---

## Safety hooks for destructive operations (2026-03-29)

**Purpose:** Prevent accidental destructive operations by asking for approval before executing them.

**Changes:**

- `.claude/hooks/safety-check.sh`: PreToolUse hook script that detects DROP TABLE, TRUNCATE, DELETE without WHERE, ALTER DROP COLUMN, rm -rf, git reset --hard, git clean -f, git push --force, and .env/credential file modifications. Returns `permissionDecision: "ask"` to prompt for approval.
- `.claude/settings.json`: Registers the hook on Write, Edit, and Bash tools.

---

## Kept credential proxy instead of OneCLI (2026-04-04)

**Decision:** Upstream v1.2.36+ replaced `credential-proxy.ts` with OneCLI Agent Vault. We kept our credential proxy for three reasons:

1. Our todo API proxy route lives in `credential-proxy.ts` (port 3001 → MC port 3002). Containers can only reach port 3001 on this VPS.
2. Docker networking on this VPS has unpredictable port reachability — OneCLI's port 10254 may not work from containers.
3. OneCLI is still early in development — waiting for it to stabilise before migrating.

**Impact:** Each upstream merge will have a modify/delete conflict on `credential-proxy.ts`. Resolve by keeping our version (`git add src/credential-proxy.ts`). Also need to remove OneCLI references from `container-runner.ts` and `index.ts` and restore credential proxy imports.

**Revisit:** When OneCLI stabilises and the todo proxy route can be moved elsewhere.

---

## Todo-Scoped Worker Containers (2026-04-05)

**What:** Todo assignment now spawns isolated worker containers (`worker:todo-{id}`) instead of injecting into the main agent's session. Multiple todos run in parallel (up to 15 concurrent containers).

**Why:** Parallel execution without context-switching. Each worker gets its own session, CLAUDE.md (from Sky's template + todo context), and Sky-level mounts.

**Changes:**

- `src/worker.ts` — Worker lifecycle module (create, soft-delete to trash, HITL cleanup via `listTrash`/`purgeTrash`)
- `src/config.ts` — `MAX_CONCURRENT_CONTAINERS` default raised from 5 to 15
- `src/container-runner.ts` — `buildVolumeMounts` gives `worker:todo-*` groups Sky-level mounts (project root, store, ToME) without `isMain`
- `src/api.ts` — `POST /api/workers` and `DELETE /api/workers/:todoId` endpoints, plus `setWorkerCallbacks` for in-memory sync
- `src/index.ts` — `processGroupMessages` and `startMessageLoop` handle channelless worker groups (skip typing, skip channel output)
- `src/group-folder.ts` — `GROUP_FOLDER_PATTERN` regex allows `:` for `worker:todo-*` folder names
- `MC: src/server/routes/todos.ts` — Assignment calls `POST /api/workers`, completion/cancellation calls `DELETE /api/workers/:todoId`

**Design decisions:**
- Only `worker:todo-*` groups get Sky replication. Existing specialist workers (`worker:llm-*`) unchanged.
- Workers communicate via IPC `send_message` and MCP todo tools (no channel).
- Soft-delete to `data/trash/` on completion. Weekly HITL cleanup prompt (no auto-purge).
- CLAUDE.md generated once at assignment time. Session context carries through feedback rounds.
- Path safety checks in `destroyWorker` prevent accidental deletion of non-worker folders.
