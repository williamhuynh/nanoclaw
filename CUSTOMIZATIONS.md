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
