# Mission Control Agent Logs — Design

## Overview

Add live agent activity monitoring to Mission Control. Conversation messages as the primary view with drill-down to container and process logs. Real-time updates via WebSocket event system with no polling.

## 1. Event System

### Architecture

```
NanoClaw (src/)                    Mission Control (apps/mission-control/)
    │                                      │
    ├─ onMessage callback ──┐              │
    ├─ container spawn/close ┼──► data/events/*.json ──► fs.watch ──► /ws/events WebSocket
    ├─ delegation start/end ─┘              │                              │
    │                                      │                              ▼
    │                                      │                     Browser clients
```

### Event Directory

`data/events/` — NanoClaw writes JSON event files here. Mission Control watches with `fs.watch`, reads, broadcasts to WebSocket clients, then deletes the file.

### Event Types

**message_stored** — new message received or sent
```json
{"type": "message_stored", "chatJid": "...", "sender": "...", "content": "...", "timestamp": "...", "groupFolder": "...", "isFromMe": false}
```

**container_started** — agent container spawned
```json
{"type": "container_started", "groupFolder": "...", "containerName": "...", "timestamp": "..."}
```

**container_completed** — agent finished
```json
{"type": "container_completed", "groupFolder": "...", "containerName": "...", "duration": 12345, "exitCode": 0, "timestamp": "..."}
```

**delegation_started** — delegation IPC picked up
```json
{"type": "delegation_started", "sourceGroup": "...", "targetGroup": "...", "delegationId": "...", "timestamp": "..."}
```

**delegation_completed** — delegation result written
```json
{"type": "delegation_completed", "sourceGroup": "...", "targetGroup": "...", "delegationId": "...", "status": "success", "timestamp": "..."}
```

### Emit Points in NanoClaw

Thin additions (~15 lines total):
- `src/index.ts` — onMessage callback → `message_stored`
- `src/container-runner.ts` — spawn → `container_started`, close → `container_completed`
- `src/ipc.ts` — delegate case → `delegation_started`, .then()/.catch() → `delegation_completed`

Shared helper function writes JSON to `data/events/`:
```typescript
function emitEvent(event: object): void {
  const dir = path.join(DATA_DIR, 'events');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(event));
}
```

## 2. Dashboard Agent Activity Cards

### Current State

Dashboard shows registered channels as a list with JID, name, folder, trigger.

### Enhancement

Each agent displayed as an expandable card:

**Collapsed (default):**
- Agent name
- Status dot (green = running, grey = idle, blue = delegating)
- Last activity timestamp

**Expanded (on press):**
- Rolling feed of last 5 minutes of activity
- Condensed message previews: "User: Write a LinkedIn post..." / "Sky: 📝 LinkedIn Post Draft..."
- Delegation markers: "🔄 Delegating to linkedin-agent..." as clickable link to that agent's card
- Click to navigate to Messages page filtered to that agent

**Data source:**
- Status derived from WebSocket events (`container_started` = running, `container_completed` = idle)
- Recent messages from `message_stored` events (kept in memory, rolling 5-min window)
- On page load: one initial API call to `GET /api/messages/recent` for last 5 mins per group
- After load: entirely event-driven, no polling

## 3. Enhanced Messages Page

### Agent Selector Sidebar

- List of all registered agents/groups
- Status dot per agent (green/grey)
- Click to filter messages to that agent
- Badge showing new message count since last viewed

### Message Feed (Main Area)

- Real-time updates via WebSocket (new messages appear at bottom)
- Chat-style layout: user messages one side, agent responses other side
- Delegation markers inline: "🔄 Delegated to linkedin-agent" as clickable link that switches to that agent's feed
- Timestamp grouping (today, yesterday, etc.)

### Detail Panel (Right Side, Appears on Click)

Click a container run block → panel shows:
- Container name, duration, exit code
- Mounts list
- Session ID
- Stderr/stdout excerpts if error
- Data sourced from `groups/{folder}/logs/container-*.log` files via API

## 4. New API Endpoints & WebSocket Channel

### New WebSocket Channel

`/ws/events` — broadcasts event objects from `data/events/` directory

### New REST Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/messages/recent?group={folder}&minutes=5` | GET | Messages from last N minutes for a group (dashboard card initial load) |
| `/api/logs/container?group={folder}&timestamp={iso}` | GET | Parsed container log file content by group and timestamp |
| `/api/logs/container/list?group={folder}&limit=10` | GET | Recent container run log metadata (timestamp, duration, exit code) |

### No Changes to Existing Endpoints

Current `/api/messages` search works as-is for the messages page's search/filter functionality.

## 5. NanoClaw Core Changes

Minimal — follows architecture principle of thin event emits:

| File | Change | Lines |
|------|--------|-------|
| `src/index.ts` | Emit `message_stored` in onMessage callback | ~3 |
| `src/container-runner.ts` | Emit `container_started` in spawn, `container_completed` in close | ~8 |
| `src/ipc.ts` | Emit `delegation_started`/`completed` in delegate case | ~6 |
| New: `src/events.ts` | Shared `emitEvent()` helper | ~10 |

Total: ~27 lines of new code in NanoClaw core.
