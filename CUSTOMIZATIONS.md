# NanoClaw Customizations

Local modifications to the core NanoClaw engine. Referenced by `/update-nanoclaw` during merge conflict resolution to preserve intentional changes.

## Format

Each entry: **what** was changed, **why**, and **which files** were modified.

---

## Pass NANOCLAW_API_KEY into the main container (2026-05-05)

**Problem:** The nightly orphan-worker cleanup task runs inside Sky (main)'s agent container and calls `DELETE /api/workers/:id` on the host. That endpoint requires Bearer auth (`NANOCLAW_API_KEY`), but containers were spawned without the key in their env, so every cleanup attempt got a 401 and orphaned workers piled up. The task script's `process.env.NANOCLAW_API_KEY || ''` resolved to empty (`hasApiKey: false`), no `Authorization` header was sent, and the host correctly rejected the calls.

**Solution:** When `isMain === true`, inject `NANOCLAW_API_KEY` into the container env. Other groups don't get it because `/api/workers` is admin-only and they have no business calling it. The key is read from `process.env.NANOCLAW_API_KEY` first, then `.env` (mirroring how `api.ts` reads it on the server side).

**Security note:** This is a self-issued auth token for nanoclaw's localhost-only admin API, not a third-party secret. Containers already have full IPC access to the host (register/delete groups, etc.) — this just lets them use the HTTP path too. The `host.docker.internal:3004` endpoint isn't reachable from outside the container's network namespace.

**Changes:**

- `src/api.ts`: Made `getApiKey()` exported so other modules can resolve the key the same way the auth check does.
- `src/container-runner.ts`: Added `isMain` param to `buildContainerArgs`; injects `-e NANOCLAW_API_KEY=...` only for main. Imported `getApiKey` from `./api.js`.

---

## Delegate poll timeout raised to 25 min (2026-05-05)

**Problem:** The `delegate` MCP tool in the agent-runner polls for the specialist's IPC result file with a 10-min hard limit. Specialists often need longer (multi-step research, code changes, analysis), and Sky was returning "Delegation timed out after 10 minutes" even though the specialist's container can run up to 30 min (`CONTAINER_TIMEOUT` default = 1,800,000 ms). Sky's per-group queue is serialized, so a stuck delegation also blocks any new messages from the user.

**Solution:** Bump the poll `TIMEOUT_MS` from 600_000 (10 min) to 1_500_000 (25 min) — just under the container cap so the specialist always finishes (or fails cleanly) before the poller gives up. Updated the tool's docstring and the user-facing timeout message to match.

**Trade-off:** Sky's container stays blocked for the duration of the delegation. Acceptable for now since the typical case is <10 min; revisit with a fire-and-forget variant if 25 min becomes a real ceiling.

**Changes:**

- `container/agent-runner/src/ipc-mcp-stdio.ts`: `TIMEOUT_MS = 1_500_000`, updated the tool description ("up to 25 minutes") and timeout error message.

---

## Default agent model is Opus 4.7 (2026-05-04)

**Problem:** When a registered group's `containerConfig.model` was unset, the agent-runner passed `undefined` to the SDK, which fell back to Sonnet. Two groups (`linkedin-agent`, `alceon-project`) had no model set and were silently running on Sonnet.

**Solution:** Default the agent-runner's model to `'claude-opus-4-7'` when `CLAUDE_MODEL` is unset. Per-group overrides via `containerConfig.model` still work as before.

**Changes:**

- `container/agent-runner/src/index.ts`: `model: process.env.CLAUDE_MODEL || 'claude-opus-4-7'`.
- `src/types.ts`: Updated `ContainerConfig.model` comment to reflect the new default.

---

## Self-service project agent bootstrapping (2026-04-07)

**Purpose:** Let Sky (main) bootstrap new persistent project/specialist agents (like `aid-coo`, `naa-project`) end-to-end from a chat, without needing a host Claude Code session for the mechanical `cp` + DB insert + restart work.

**Problem:** The existing `register_group` IPC tool handles DB registration, but the agent's folder (`groups/{folder}/`) is not mounted into Sky's container — Sky cannot `cp` a populated staging folder into a sibling group directory. Every new project agent therefore required a host session to copy the folder, then a systemctl restart (because out-of-process DB writes don't update the running nanoclaw's in-memory state).

**Solution:** New `promote_staged_agent` IPC tool. Sky creates/populates a staging folder inside its own workspace (`/workspace/group/{staging-name}/`), then calls the tool. The host validates the staging path (must be inside main's group directory, no traversal), validates the target folder name and ensures it doesn't exist, copies staging → target, and calls the existing in-process `registerGroup()` — which updates DB + in-memory state live. No restart needed.

**Security:**
- Main-only (same gate as `register_group`, `delegate`, `refresh_groups`)
- Staging path is resolved against main's group directory and containment-checked via `path.relative` — no arbitrary filesystem access
- Target folder validated via `isValidGroupFolder` (same rules as all group folders)
- Target must not already exist (no overwrite)
- JID must not already be registered (no takeover)
- `isMain` is forced to `undefined` — new agents cannot be registered as main via IPC
- On copy failure, partial copies are cleaned up (best-effort)

**Changes:**

- `src/ipc.ts`: Added `promote_staged_agent` case to `processTaskIpc` dispatch. Added `stagingFolder` field to the data type. Reuses `deps.registerGroup` for DB + in-memory registration.
- `container/agent-runner/src/ipc-mcp-stdio.ts`: Added `promote_staged_agent` MCP tool mirroring the `register_group` pattern (writes IPC task file, returns ack).
- `groups/main/CLAUDE.md`: Added "Creating a Project/Specialist Agent" section documenting the staging pattern and tool usage.

**Not covered (stays host-only):** changes to `src/`, skill code, container rebuilds, OneCLI config, systemd service. These can bypass the sandbox on restart so they require host access.

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

---

## Per-group model selection (2026-04-12)

**Problem:** All NanoClaw agents defaulted to Sonnet (the Agent SDK default) even though the host uses OAuth/Max plan which defaults to Opus in the CLI. No way to configure different models for different agents.

**Solution:** Added `model` field to `ContainerConfig`. The container runner passes it as `CLAUDE_MODEL` env var to Docker. The agent-runner reads it and passes it to the SDK `query()` call. Configurable per group via the `container_config` JSON column in `registered_groups`.

**Changes:**

- `src/types.ts`: Added `model?: string` to `ContainerConfig` interface.
- `src/container-runner.ts`: `buildContainerArgs()` accepts optional `model` param, passes as `-e CLAUDE_MODEL={model}` to Docker. `runContainerAgent()` reads `group.containerConfig?.model` and forwards it.
- `container/agent-runner/src/index.ts`: Passes `process.env.CLAUDE_MODEL` to SDK `query()` options as `model` field.
- `src/worker.ts`: Workers created with `containerConfig: { model: 'claude-opus-4-7' }` by default.
- `store/messages.db`: Set `container_config.model = 'claude-opus-4-7'` for project groups (main, aid-coo, naa-project, homeschoollms-dev, tandemly-dev, mission-control). linkedin-agent left unset (Sonnet default).
- `MC: src/server/routes/tasks.ts`: Tasks endpoint resolves and returns `resolved_model` from group's container_config.
- `MC: src/frontend/pages/TasksPage.tsx`: Model badge on each task (Opus purple, Sonnet blue, Haiku green).

**Container image rebuild required** (agent-runner code change).

---

## Granular agent activity status (2026-04-12)

**Problem:** Mission Control's agent activity dots only showed two states (green=running, gray=idle) based on events. Status could go stale if events were missed (WebSocket reconnect, MC restart). No way to tell if an agent was actively working vs just sitting idle in a container.

**Solution:** Five-state activity indicator with Docker reconciliation.

**States:**
- Green: actively working (container_started, no idle yet)
- Blue: alive but idle/waiting (container_idle event received, or delegation completed)
- Amber: possibly stuck (running >10 min without producing output or going idle)
- Gray: not running (container_completed or no container)
- Blue (delegating variant): delegating to another agent

**Changes:**

- `src/index.ts`: Emit `container_idle` event after agent sends its response and idle timer starts.
- `MC: src/frontend/hooks/useEventsWebSocket.ts`: Added `waiting` and `stuck` status values. Added `lastStarted` timestamp tracking. New `reconcileStatuses()` function that polls `/api/dashboard/containers` (Docker state) to correct stale event-driven statuses.
- `MC: src/frontend/pages/DashboardPage.tsx`: Five-color status dots with title tooltips. Refresh button next to "Agent Activity" header that calls `reconcileStatuses()` to sync with Docker reality.

---

## Session lifecycle redesign — time-bounded sessions (2026-04-12)

**Problem:** Sessions grow unboundedly. Each group has one persistent session that accumulates every interaction across days/weeks, causing escalating API costs from loading large contexts. The tandemly-dev session reached 8.1MB (100k+ cache tokens per invocation). Short conversations that don't trigger SDK auto-compaction are never archived, creating gaps in the wiki extraction pipeline.

**Solution:** Time-bounded sessions with archive-before-discard. At container spin-up, if the session file is older than `SESSION_MAX_AGE_MS` (default 2 hours, configurable via env var), archive it to `conversations/` as markdown and start fresh. Also switched all scheduled tasks to `context_mode: isolated` — recurring tasks have no need for accumulated session history.

**Changes:**

- `src/config.ts`: Added `SESSION_MAX_AGE_MS` export (default 2h, override via env var).
- `src/index.ts`: Added `archiveSession()` helper — reads session JSONL, extracts user/assistant text, writes markdown to `groups/{folder}/conversations/{date}-session-{time}.md`. Skips trivial sessions (< 5 messages). Added time-based session age check in `runAgent()`, right after the existing 2MB size check. If session expired, archives and clears it.
- `store/messages.db`: All active scheduled tasks switched to `context_mode: 'isolated'` (8 tasks changed: 6 main-group LinkedIn/news tasks + 2 PR check tasks changed earlier).

**Design doc:** `docs/plans/2026-04-12-session-lifecycle-redesign.md`

**Why two extraction sources (wiki vs tome) is intentional:**
- Wiki extraction reads `conversations/*.md` — full transcripts including agent reasoning and tool usage. Rich format needed for entity/finding/decision extraction.
- Tome-observe reads `messages` DB — raw user messages always complete, real-time, queryable. Right for learning signals about user preferences and corrections.
- `conversations/` is now complete thanks to archive-on-reset (previously only populated by SDK auto-compaction).

## Excalidraw MCP server registration (2026-04-23)

**Purpose:** Give Sky and other nanoclaw agents live canvas tools — render, iterate, and screenshot Excalidraw diagrams in real time — instead of only emitting static `.excalidraw` JSON files that need a local viewer to inspect.

**Solution:** Register the official Excalidraw MCP (`github.com/excalidraw/excalidraw-mcp`) via its hosted remote endpoint at `https://mcp.excalidraw.com/mcp` as a Streamable HTTP MCP server. No host-side install; every agent container picks it up on next spawn via the existing mtime-driven per-group source copy in `src/container-runner.ts:302–328`.

**Changes:**

- `container/agent-runner/src/index.ts`:
  - Added `'mcp__excalidraw__*'` to the `allowedTools` glob list (after `mcp__gcalendar__*`).
  - Added `excalidraw: { type: 'http', url: 'https://mcp.excalidraw.com/mcp' }` to the `mcpServers` block.

**Verified pre-deploy:**
- Repo is official (excalidraw org).
- Endpoint `/mcp` advertises `GET, POST, DELETE, OPTIONS` + `Mcp-Session-Id` → confirms Streamable HTTP transport (not legacy SSE).
- `npx tsc --noEmit` clean in `container/agent-runner/`.

**Security note:** Every agent can now reach `mcp.excalidraw.com` and send whatever content it renders. Risk bounded by what the agent chooses to include in a diagram; non-trivial but acceptable for Sky's diagramming use case.

**Rollback:** revert the two hunks in `container/agent-runner/src/index.ts`. Change takes effect only on next container spawn; running containers are unaffected either way.
