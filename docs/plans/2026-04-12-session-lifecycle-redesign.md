# Session Lifecycle Redesign — Design Spec

## Problem

NanoClaw sessions grow unboundedly. Each group has one persistent session that accumulates every interaction across days and weeks. This causes:

1. **Escalating costs**: Each interaction loads the full session as context. A 250KB session (aid-coo) costs ~224k tokens to cache. The tandemly-dev session reached 8.1MB before we caught it.
2. **Incomplete archives**: Conversations are only archived to `conversations/` when the SDK auto-compacts — which requires the context to get large within a single container run. Short conversations are never archived and never reach the wiki extraction pipeline.
3. **Two extraction sources**: Wiki extraction reads from `conversations/*.md` (incomplete). Tome-observe reads from the `messages` SQLite table (always complete, but text-only). These serve different extraction needs but the split is accidental, not designed.

## Goals

1. Sessions are time-bounded. No session lives longer than a configurable idle period.
2. Every conversation is archived to `conversations/` regardless of length.
3. The archive pipeline has a single, complete source of truth per extraction type.
4. Changes are minimal and contained — no architectural rewrites.

## Non-Goals

- Changing how the SDK handles compaction within a session (that's Anthropic's domain)
- Changing the container lifecycle or idle timeout (30 min is fine for keeping containers warm)
- Changing how the messages table works (it serves routing, not extraction)
- Real-time extraction (nightly batch is fine for wiki and tome)

---

## Current Data Flow

```
User sends message
  │
  ├─→ messages table (always, via channel handler)
  │     Raw text: sender, content, timestamp, chat_jid
  │     Read by: tome-observe (nightly), message routing
  │
  ├─→ Session JSONL (always, via SDK)
  │     Rich: tool calls, reasoning, agent responses, metadata
  │     Read by: SDK on next container spin-up (context loading)
  │
  └─→ conversations/*.md (ONLY on SDK auto-compaction)
        Formatted markdown transcript
        Read by: wiki extraction (nightly)
```

**Gap**: conversations/ is incomplete. Short conversations that don't trigger auto-compaction are never archived there.

## Proposed Data Flow

```
User sends message
  │
  ├─→ messages table (unchanged)
  │
  ├─→ Session JSONL (unchanged within container lifecycle)
  │
  └─→ conversations/*.md (written on TWO triggers):
        1. SDK auto-compaction (existing pre-compact hook — unchanged)
        2. Session reset at container spin-up (NEW)
```

**Result**: conversations/ becomes a complete archive. Every session that gets discarded is archived first.

---

## Design

### Change 1: Session Age Check at Spin-Up

**File**: `src/index.ts`, inside `runAgent()`, right after the existing 2MB size check (~line 355)

**Logic**:

```
SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000  (2 hours, configurable via env)

When a container spins up for a group:
  1. Look up the group's sessionId
  2. If sessionId exists, stat the session JSONL file
  3. If file's mtime is older than SESSION_MAX_AGE_MS:
     a. Archive the old session (Change 2)
     b. Delete the session file
     c. Clear sessionId from memory and DB
     d. Log: "Session expired ({age}h), starting fresh"
  4. If file is recent: load it as normal (existing behaviour)
```

**Why at spin-up, not on idle/shutdown**:
- The decision matters at the moment you're about to pay the cache cost
- Handles container crashes gracefully (no cleanup needed on the crash path)
- The existing 2MB check already follows this pattern — time check is the same shape
- Container shutdown stays simple (just exit)

**Why 2 hours**:
- Container idle timeout is 30 min — container dies after 30 min silence
- If user comes back within 2 hours, they get continuity (new container loads old session)
- After 2 hours, it's a new conversation — start fresh
- Matches Hermes Agent's approach (configurable idle reset, defaults to longer durations)
- Configurable via `SESSION_MAX_AGE_MS` env var for tuning

**Interaction with existing 2MB check**: Both checks run. A session can be reset by EITHER being too old OR too large. The 2MB check is the safety net for sessions that grow very fast within the 2-hour window (e.g., a long active coding session).

### Change 2: Archive Session on Reset

**File**: `src/index.ts`, new helper function `archiveSession()`

When a session is being discarded (age or size), convert the JSONL to a markdown archive and write it to `conversations/`.

**Logic**:

```
function archiveSession(groupFolder: string, sessionId: string):
  1. Read the session JSONL file
  2. Parse user/assistant message pairs (skip queue-operation, metadata lines)
  3. Format as markdown (same format as pre-compact hook output):
     # Conversation
     Archived: {timestamp}
     ---
     **User**: {message}
     **Agent**: {response}
     ...
  4. Write to groups/{groupFolder}/conversations/{date}-session-{HHMM}.md
  5. Log: "Archived session to {path}"
```

**Why host-side, not in-container**: This runs in `src/index.ts` on the host before the container starts. No API calls, no container overhead. Just file I/O.

**Naming convention**: `{date}-session-{HHMM}.md` (vs existing `{date}-conversation-{HHMM}.md` from pre-compact). The `session-` prefix distinguishes host-archived sessions from SDK-compacted conversations. Both are valid inputs for the wiki extraction pipeline.

**Duplicate prevention**: If the pre-compact hook already archived most of this session's content (because SDK compacted during the session), the host archive will contain only the post-compaction messages. This is fine — wiki extraction handles overlapping content via dedup (checks index.md before creating pages).

**Edge cases**:
- Empty/trivial session (< 5 messages): Skip archiving, just delete. Not worth extracting.
- Corrupt/unreadable JSONL: Log warning, delete anyway. Don't block the new session.
- Session file doesn't exist: No-op. Session was already cleaned up.

### Change 3: Scheduled Tasks — All Isolated

**No code change needed** — this is a data migration.

All scheduled tasks should use `context_mode: isolated`. There is no scenario where a recurring scheduled task benefits from accumulating session history:

| Task Type | Why Isolated |
|-----------|-------------|
| PR checks | Stateless: "are there PRs?" doesn't need yesterday's answer |
| Sentry checks | Stateless: "are there errors?" same |
| LinkedIn posts | Delegates to linkedin-agent via IPC — main session irrelevant |
| AI news monitor | Delegates via IPC — same |
| Wiki extraction | Reads conversations/ — session irrelevant |
| Tome-observe | Reads messages DB — session irrelevant |
| Tome-review | Reads tome journal — session irrelevant |
| Todo digest | Reads todos via MCP — session irrelevant |

**Migration**: Update all remaining `context_mode: 'group'` tasks to `'isolated'` in the scheduled_tasks table.

### What Stays the Same

| Component | Change? | Reason |
|-----------|---------|--------|
| Pre-compact hook | No | Still fires on SDK auto-compaction within a session. Archives mid-session compactions as before. |
| Container idle timeout (30 min) | No | Good for keeping containers warm during active chats. |
| Messages table | No | Still written by channel handlers. Still the source for tome-observe. |
| Tome-observe source (messages DB) | No | Messages DB captures every interaction regardless of session lifecycle. Text-only is fine for learning signals. See rationale below. |
| Wiki extraction source (conversations/) | No | conversations/ has the rich formatted transcripts. Now complete thanks to Change 2. |
| Container lifecycle | No | Spin up on message, idle for 30 min, die. Same as today. |

---

## Why Two Extraction Sources Is Actually Correct

At first glance, wiki and tome reading from different sources looks accidental. But the sources serve genuinely different extraction needs:

**Tome-observe → messages table**
- Needs: user corrections, preferences, communication patterns
- Requires: every user message, even from trivial 2-message exchanges
- Doesn't need: agent tool calls, reasoning chains, full context
- Messages table is always complete and text-focused — ideal

**Wiki extraction → conversations/*.md**
- Needs: decisions made, entities discussed, findings, meeting notes
- Requires: full conversation including agent analysis and reasoning
- Short trivial exchanges rarely have extractable wiki content
- Formatted markdown transcripts are ideal for this

Forcing both through the same source would either:
- Give tome too much noise (agent tool calls aren't learning signals)
- Give wiki too little context (messages DB lacks reasoning/tool usage)

The design keeps both sources but makes conversations/ complete (Change 2), eliminating the only actual gap.

---

## Implementation

### Step 1: Session Archive Helper

New function in `src/index.ts` (or extract to `src/session-archive.ts`):

```typescript
function archiveSession(groupFolder: string, sessionId: string): void {
  const sessionFile = path.join(
    DATA_DIR, 'sessions', groupFolder,
    '.claude', 'projects', '-workspace-group',
    `${sessionId}.jsonl`,
  );

  if (!fs.existsSync(sessionFile)) return;

  const stat = fs.statSync(sessionFile);
  const lines = fs.readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean);

  // Skip trivial sessions
  const messageLines = lines.filter(l => {
    try {
      const obj = JSON.parse(l);
      return obj.type === 'user' || obj.type === 'assistant';
    } catch { return false; }
  });

  if (messageLines.length < 5) {
    logger.debug({ groupFolder, sessionId, lines: messageLines.length },
      'Session too short to archive');
    return;
  }

  // Format as markdown
  const parts: string[] = [
    '# Conversation\n',
    `Archived: ${new Date().toISOString()}\n`,
    '---\n',
  ];

  for (const line of messageLines) {
    try {
      const obj = JSON.parse(line);
      const msg = obj.message;
      if (obj.type === 'user') {
        const content = typeof msg.content === 'string'
          ? msg.content
          : msg.content?.filter(b => b.type === 'text').map(b => b.text).join('\n');
        if (content) parts.push(`**User**: ${content}\n\n`);
      } else if (obj.type === 'assistant') {
        const content = msg.content?.filter(b => b.type === 'text').map(b => b.text).join('\n');
        if (content) parts.push(`**Assistant**: ${content}\n\n`);
      }
    } catch { /* skip unparseable lines */ }
  }

  // Write archive
  const convDir = path.join(GROUPS_DIR, groupFolder, 'conversations');
  fs.mkdirSync(convDir, { recursive: true });
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].slice(0, 5).replace(':', '');
  const filename = `${dateStr}-session-${timeStr}.md`;
  fs.writeFileSync(path.join(convDir, filename), parts.join(''));

  logger.info({ groupFolder, filename, messages: messageLines.length },
    'Archived expired session');
}
```

### Step 2: Age Check in runAgent()

Add after the existing 2MB check in `src/index.ts` (~line 386):

```typescript
const SESSION_MAX_AGE_MS = parseInt(
  process.env.SESSION_MAX_AGE_MS || String(2 * 60 * 60 * 1000), 10
);

if (sessionId) {
  // ... existing 2MB check ...

  // Time-based session reset
  if (sessionId) { // may have been cleared by size check above
    try {
      const stats = fs.statSync(sessionFile);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs > SESSION_MAX_AGE_MS) {
        logger.info(
          { group: group.name, ageHours: (ageMs / 3600000).toFixed(1) },
          'Session expired — archiving and starting fresh',
        );
        archiveSession(group.folder, sessionId);
        try { fs.unlinkSync(sessionFile); } catch { /* ignore */ }
        delete sessions[group.folder];
        deleteSession(group.folder);
        sessionId = undefined;
      }
    } catch { /* file doesn't exist, that's fine */ }
  }
}
```

### Step 3: Migrate Remaining Group-Context Tasks

```sql
UPDATE scheduled_tasks
SET context_mode = 'isolated'
WHERE context_mode = 'group' AND status = 'active';
```

### Step 4: Update Wiki Extraction Task Prompt

The nightly wiki extraction task already globs `conversations/*.md`. The new `session-*.md` files will be picked up automatically since they're in the same directory and match the glob. No prompt change needed.

### Step 5: Build, Restart, Verify

```bash
cd /home/nanoclaw/nanoclaw && npm run build
systemctl --user restart nanoclaw
```

### Step 6: Clean Up Bloated Sessions

One-time cleanup of existing oversized sessions:

```bash
# Archive and delete the bloated tandemly-dev and homeschoollms-dev sessions
# (Will happen automatically on next interaction, but can be done proactively)
```

---

## Testing

1. **Session expiry**: Set SESSION_MAX_AGE_MS to 60000 (1 min) temporarily. Send a message to a group. Wait 2 min. Send another. Verify:
   - Old session archived to conversations/
   - New session created (fresh sessionId in DB)
   - Agent responds without old context

2. **Session continuity within window**: Send two messages 30 seconds apart. Verify the agent remembers the first message (same session loaded).

3. **Short session skip**: Send one very short message, wait for session to expire. Verify no archive is created (< 5 messages threshold).

4. **Pre-compact still works**: Have a long conversation that triggers SDK auto-compaction. Verify conversations/ gets BOTH:
   - The auto-compacted archive (existing filename pattern)
   - The session archive on next reset (if session expires later)

5. **Wiki extraction picks up session archives**: After archives appear with `session-` prefix, verify the nightly wiki extraction processes them.

6. **Cost verification**: Compare cache_creation_tokens before and after for the same group. Should drop significantly after session reset.

---

## Rollout

1. Deploy to all groups simultaneously (the change is backward-compatible — groups with recent sessions see no difference)
2. Monitor for first few days:
   - Check conversations/ for new session archives appearing
   - Compare usage costs before/after
   - Verify no "where did my context go" complaints (unlikely since wiki/tome preserve knowledge)
3. Tune SESSION_MAX_AGE_MS if needed (default 2h, adjustable via env var)

## Future Considerations

- **Session file cleanup cron**: Old session JSONL files accumulate on disk. A weekly housekeeping job to delete session files older than 7 days would prevent disk bloat. Not urgent — session files are small individually.
- **Smarter archiving**: The host-side archive is text-only (user/assistant messages). A richer archive that includes tool call summaries could improve wiki extraction quality. Enhancement, not v1.
- **Per-group session policy**: Some groups might benefit from longer/shorter session windows. Could add a `session_max_age_ms` column to registered_groups. Not needed until there's a concrete need.
