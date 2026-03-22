# Mission Control Agent Logs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live agent activity monitoring to Mission Control with real-time WebSocket events, expandable dashboard agent cards, and an enhanced messages page with delegation tracing and container log drill-down.

**Architecture:** NanoClaw emits event JSON files to `data/events/`. Mission Control watches with `fs.watch`, broadcasts via `/ws/events` WebSocket. Dashboard shows expandable agent cards; Messages page shows real-time chat feed with detail panel for container logs.

**Tech Stack:** NanoClaw (Node.js/TypeScript), Mission Control (React 19 + Express 5 + WebSocket), SQLite, TanStack React Query.

---

### Task 1: Create NanoClaw event emitter helper

**Files:**
- Create: `/home/nanoclaw/nanoclaw/src/events.ts`

**Step 1: Create the emitEvent helper**

```typescript
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';

const EVENTS_DIR = path.join(DATA_DIR, 'events');

export function emitEvent(event: Record<string, unknown>): void {
  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filepath = path.join(EVENTS_DIR, filename);
    const tempPath = `${filepath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(event));
    fs.renameSync(tempPath, filepath);
  } catch {
    // Silently fail — events are non-critical telemetry
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean compile.

**Step 3: Commit**

```bash
git add src/events.ts
git commit -m "feat: add event emitter helper for Mission Control telemetry"
```

---

### Task 2: Emit message_stored events in NanoClaw

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/src/index.ts` (onMessage callback, around line 725)

**Step 1: Add import at top of file**

```typescript
import { emitEvent } from './events.js';
```

**Step 2: Emit event after storeMessage call**

Find the `storeMessage(msg)` call in the `onMessage` callback (around line 751). Add immediately after it:

```typescript
      storeMessage(msg);
      emitEvent({
        type: 'message_stored',
        chatJid,
        sender: msg.sender,
        senderName: msg.sender_name,
        content: msg.content.slice(0, 200),
        timestamp: msg.timestamp,
        groupFolder: registeredGroups[chatJid]?.folder,
        isFromMe: msg.is_from_me || false,
      });
```

Note: content is truncated to 200 chars — events are for notifications, not full message storage.

**Step 3: Build and test**

Run: `npm run build && npx vitest run`
Expected: Clean build, all tests pass.

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: emit message_stored events for Mission Control"
```

---

### Task 3: Emit container events in NanoClaw

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/src/container-runner.ts`

**Step 1: Add import**

```typescript
import { emitEvent } from './events.js';
```

**Step 2: Emit container_started after spawn**

Find the `onProcess(container, containerName)` call (around line 369). Add after it:

```typescript
    emitEvent({
      type: 'container_started',
      groupFolder: group.folder,
      groupName: group.name,
      containerName,
      isMain: input.isMain,
      timestamp: new Date().toISOString(),
    });
```

**Step 3: Emit container_completed in the close handler**

Find `container.on('close', (code) => {` (around line 490). Add after `const duration = Date.now() - startTime;`:

```typescript
      emitEvent({
        type: 'container_completed',
        groupFolder: group.folder,
        groupName: group.name,
        containerName,
        duration,
        exitCode: code,
        timedOut,
        timestamp: new Date().toISOString(),
      });
```

**Step 4: Build and test**

Run: `npm run build && npx vitest run`

**Step 5: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat: emit container start/complete events for Mission Control"
```

---

### Task 4: Emit delegation events in NanoClaw

**Files:**
- Modify: `/home/nanoclaw/nanoclaw/src/ipc.ts`

**Step 1: Add import**

```typescript
import { emitEvent } from './events.js';
```

**Step 2: Emit delegation_started in delegate case**

Find `logger.info({ sourceGroup, targetFolder, delegationId }, 'Delegation started');` (around line 549). Add after it:

```typescript
        emitEvent({
          type: 'delegation_started',
          sourceGroup,
          targetGroup: targetFolder,
          delegationId,
          timestamp: new Date().toISOString(),
        });
```

**Step 3: Emit delegation_completed in .then() callback**

Find `logger.info({ ... }, 'Delegation completed');` in the .then() block (around line 574). Add after it:

```typescript
            emitEvent({
              type: 'delegation_completed',
              sourceGroup,
              targetGroup: targetFolder,
              delegationId,
              status: result.status,
              timestamp: new Date().toISOString(),
            });
```

**Step 4: Emit delegation_completed (error) in .catch() callback**

Find `logger.error({ ... }, 'Delegation failed');` in the .catch() block (around line 593). Add after it:

```typescript
            emitEvent({
              type: 'delegation_completed',
              sourceGroup,
              targetGroup: targetFolder,
              delegationId,
              status: 'error',
              timestamp: new Date().toISOString(),
            });
```

**Step 5: Build and test**

Run: `npm run build && npx vitest run`

**Step 6: Commit**

```bash
git add src/ipc.ts
git commit -m "feat: emit delegation start/complete events for Mission Control"
```

---

### Task 5: Add /ws/events WebSocket channel in Mission Control

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/server/ws.ts`

**Step 1: Add fs import and event watcher**

Add a new WebSocket server for `/ws/events` alongside the existing three. After the existing WSS setup, add an event file watcher that:

1. Creates a new `WebSocketServer` on path `/ws/events`
2. Watches `NANOCLAW_DIR/data/events/` with `fs.watch`
3. On file change: reads new `.json` files, broadcasts to all connected clients, deletes the file
4. Handles client connect/disconnect with logging

Key constants to reference: `NANOCLAW_DIR` is likely already defined or can be derived from existing config (check existing routes for the NanoClaw project path — `dashboard.ts` line 30 uses a path).

The watcher should:
- Use `fs.watch` on the events directory
- On `rename` event (new file): read, parse JSON, broadcast to all `/ws/events` clients, delete
- Debounce slightly (10ms) to batch rapid events
- Create the events directory if it doesn't exist

**Step 2: Verify build**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/server/ws.ts
git commit -m "feat: add /ws/events WebSocket channel for live agent events"
```

---

### Task 6: Add container logs API routes in Mission Control

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/server/routes/logs.ts`
- Modify: `/home/nanoclaw/apps/mission-control/src/server/index.ts` (mount new router)

**Step 1: Create logs router**

Three endpoints:

**GET /api/messages/recent** — recent messages for dashboard cards:
- Query params: `group` (folder name), `minutes` (default 5)
- Query NanoClaw's messages.db: `SELECT * FROM messages WHERE chat_jid IN (SELECT jid FROM registered_groups WHERE json_extract(data, '$.folder') = ?) AND timestamp > ? ORDER BY timestamp DESC`
- Use the same DB connection pattern as `messages.ts`

**GET /api/logs/container/list** — list recent container runs:
- Query params: `group` (folder name), `limit` (default 10)
- Read `groups/{group}/logs/` directory
- Parse filenames for timestamps: `container-{ISO_TIMESTAMP}.log`
- For each file, read first few lines to extract metadata (duration, exit code)
- Return array of `{timestamp, duration, exitCode, filename}`

**GET /api/logs/container** — get full container log content:
- Query params: `group` (folder name), `filename` (log file name)
- Validate filename matches pattern `container-*.log` (prevent path traversal)
- Read and return the file content as text

**Step 2: Mount router in index.ts**

Add to the router imports and mount at `/api`:

```typescript
import { logsRouter } from './routes/logs.js';
// ...
app.use('/api', logsRouter);
```

**Step 3: Build and test**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/server/routes/logs.ts src/server/index.ts
git commit -m "feat: add container logs and recent messages API endpoints"
```

---

### Task 7: Create useEventsWebSocket React hook

**Files:**
- Create: `/home/nanoclaw/apps/mission-control/src/frontend/hooks/useEventsWebSocket.ts`

**Step 1: Create the hook**

A React hook that:
- Connects to `ws://{host}/ws/events`
- Parses incoming JSON events
- Maintains state: agent statuses (Map of folder → status), recent events (rolling array)
- Exposes: `events`, `agentStatuses`, `getRecentMessages(folder, minutes)`
- Auto-reconnects on disconnect (5 second delay)
- Cleans up on unmount

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';

interface AgentEvent {
  type: string;
  timestamp: string;
  groupFolder?: string;
  [key: string]: unknown;
}

interface AgentStatus {
  status: 'idle' | 'running' | 'delegating';
  lastActivity: string;
}

export function useEventsWebSocket() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  // ... connect, parse, update state, reconnect logic
  // Keep last 200 events in memory, drop older ones
  // Update agentStatuses on container_started/completed/delegation events

  const getRecentMessages = useCallback((folder: string, minutes: number) => {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return events.filter(
      e => e.type === 'message_stored' && e.groupFolder === folder && new Date(e.timestamp).getTime() > cutoff
    );
  }, [events]);

  return { events, agentStatuses, getRecentMessages };
}
```

**Step 2: Build**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 3: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/frontend/hooks/useEventsWebSocket.ts
git commit -m "feat: add useEventsWebSocket hook for real-time agent events"
```

---

### Task 8: Add expandable agent cards to Dashboard

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/DashboardPage.tsx`

**Step 1: Import and use the events hook**

```typescript
import { useEventsWebSocket } from '../hooks/useEventsWebSocket';
```

**Step 2: Add agent cards section**

Below the existing orbital visualization, add an "Agent Activity" section:
- Fetch channels from existing `/api/dashboard/channels` query (already present)
- Fetch initial recent messages via `/api/messages/recent?group={folder}&minutes=5` on mount
- For each agent: render a card with:
  - **Collapsed**: name, status dot (from `agentStatuses`), last activity time
  - **Expanded (on click)**: recent message feed (from events + initial load), delegation links
- Link to navigate to `/messages?group={folder}` on "View all" click
- Delegation events show as clickable links that expand the target agent's card

Use existing Tailwind classes from the project. Status dot colors:
- green-500 for running
- gray-400 for idle
- blue-500 for delegating

**Step 3: Build**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/frontend/pages/DashboardPage.tsx
git commit -m "feat: add expandable agent activity cards to dashboard"
```

---

### Task 9: Enhance Messages page with real-time feed

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/MessagesPage.tsx`

**Step 1: Add agent selector sidebar**

Replace or augment the existing group filter dropdown with a sidebar:
- List all groups from `/api/messages/groups` (already fetched)
- Each shows status dot from `useEventsWebSocket`
- Click to select/filter
- New message badge (count events since last viewed)

**Step 2: Add real-time message updates**

- Subscribe to `useEventsWebSocket` events
- When `message_stored` event arrives for the selected group, append to the message list
- Auto-scroll to bottom on new messages
- Chat-style layout: user messages left, agent messages right

**Step 3: Add delegation markers**

When a `delegation_started` event is in the timeline:
- Render inline marker: "🔄 Delegated to {targetGroup}"
- Clickable — switches the sidebar selection to that agent's feed

**Step 4: Build**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 5: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/frontend/pages/MessagesPage.tsx
git commit -m "feat: enhance messages page with real-time feed and agent sidebar"
```

---

### Task 10: Add container log detail panel to Messages page

**Files:**
- Modify: `/home/nanoclaw/apps/mission-control/src/frontend/pages/MessagesPage.tsx`

**Step 1: Add detail panel component**

A right-side panel that appears when clicking a container run event:
- Fetch log list: `GET /api/logs/container/list?group={folder}&limit=10`
- On click a run: `GET /api/logs/container?group={folder}&filename={name}`
- Display: container name, duration, exit code, mounts, session ID
- Show stderr/stdout if the log contains them (error cases)
- Close button to dismiss panel

**Step 2: Wire container_completed events to clickable markers**

In the message feed, `container_completed` events render as clickable blocks:
- "Container run completed (12.3s, exit 0)" — click opens detail panel
- Error runs highlighted in red: "Container error (exit 1)"

**Step 3: Build**

Run: `cd /home/nanoclaw/apps/mission-control && npm run build`

**Step 4: Commit**

```bash
cd /home/nanoclaw/apps/mission-control
git add src/frontend/pages/MessagesPage.tsx
git commit -m "feat: add container log detail panel to messages page"
```

---

### Task 11: Build, restart, and smoke test

**Step 1: Build NanoClaw**

```bash
cd /home/nanoclaw/nanoclaw && npm run build
```

**Step 2: Build Mission Control**

```bash
cd /home/nanoclaw/apps/mission-control && npm run build
```

**Step 3: Run NanoClaw tests**

```bash
cd /home/nanoclaw/nanoclaw && npx vitest run
```

**Step 4: Restart both services**

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user restart nanoclaw
systemctl --user restart mission-control  # or however MC is managed
```

**Step 5: Smoke test**

1. Open Mission Control in browser
2. Dashboard should show agent cards with status dots
3. Send a message to Sky on Telegram
4. Dashboard card should update in real-time (new message appears)
5. Click an agent card — should expand to show recent messages
6. Navigate to Messages page — should show real-time feed
7. Trigger a delegation — should see delegation markers with links
8. Click a container run — detail panel should show log info

**Step 6: Update ARCHITECTURE.md**

Add `src/events.ts` to the customisation points table:

```markdown
| `src/events.ts` | Event emitter for Mission Control | Writes telemetry events to data/events/ |
```

```bash
cd /home/nanoclaw/nanoclaw
git add docs/ARCHITECTURE.md
git commit -m "docs: add events.ts to customisation points"
```
