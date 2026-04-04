# Comprehensive Test Suite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ~142 tests across 10 test files to protect NanoClaw against regressions during upstream upgrades.

**Architecture:** All new tests follow existing vitest patterns — mock external deps (fs, child_process, logger, env), use `_initTestDatabase()` for DB tests, start HTTP servers on random ports for API tests. No running services required.

**Tech Stack:** Vitest 4.x, Node.js HTTP module, better-sqlite3 (in-memory for tests)

---

### Task 1: Environment file parsing tests (src/env.test.ts)

**Files:**
- Create: `src/env.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { readEnvFile } from './env.js';

describe('readEnvFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses KEY=value pairs', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO=bar\nBAZ=qux');
    expect(readEnvFile(['FOO', 'BAZ'])).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('only returns requested keys', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO=bar\nBAZ=qux\nNOPE=skip');
    expect(readEnvFile(['FOO'])).toEqual({ FOO: 'bar' });
  });

  it('handles double-quoted values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO="hello world"');
    expect(readEnvFile(['FOO'])).toEqual({ FOO: 'hello world' });
  });

  it('handles single-quoted values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue("FOO='hello world'");
    expect(readEnvFile(['FOO'])).toEqual({ FOO: 'hello world' });
  });

  it('skips comments', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# comment\nFOO=bar');
    expect(readEnvFile(['FOO'])).toEqual({ FOO: 'bar' });
  });

  it('skips empty lines', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('\n\nFOO=bar\n\n');
    expect(readEnvFile(['FOO'])).toEqual({ FOO: 'bar' });
  });

  it('returns empty object if file missing', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });
    expect(readEnvFile(['FOO'])).toEqual({});
  });

  it('skips lines without equals sign', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('NOEQ\nFOO=bar');
    expect(readEnvFile(['NOEQ', 'FOO'])).toEqual({ FOO: 'bar' });
  });

  it('skips keys with empty values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('EMPTY=\nFOO=bar');
    expect(readEnvFile(['EMPTY', 'FOO'])).toEqual({ FOO: 'bar' });
  });

  it('does not write to process.env', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('TEST_UNIQUE_KEY_XYZ=secret');
    readEnvFile(['TEST_UNIQUE_KEY_XYZ']);
    expect(process.env.TEST_UNIQUE_KEY_XYZ).toBeUndefined();
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/env.test.ts
```

Expected: 10 tests pass.

**Step 3: Commit**

```bash
git add src/env.test.ts
git commit -m "test: add env.ts tests (10 tests)

Covers parsing, quoting, comments, missing file, empty values,
process.env isolation."
```

---

### Task 2: Event emission tests (src/events.test.ts)

**Files:**
- Create: `src/events.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('./config.js', () => ({
  DATA_DIR: '/mock/data',
}));

import { emitEvent } from './events.js';

describe('emitEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates events directory recursively', () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {});

    emitEvent({ type: 'test' });

    expect(mkdirSpy).toHaveBeenCalledWith('/mock/data/events', { recursive: true });
  });

  it('writes event as JSON with atomic temp+rename', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});

    emitEvent({ type: 'test', data: 123 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const writtenPath = writeSpy.mock.calls[0][0] as string;
    const writtenData = writeSpy.mock.calls[0][1] as string;
    expect(writtenPath).toMatch(/\.json\.tmp$/);
    expect(JSON.parse(writtenData)).toEqual({ type: 'test', data: 123 });

    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [tmpPath, finalPath] = renameSpy.mock.calls[0];
    expect(tmpPath).toBe(writtenPath);
    expect(finalPath).toMatch(/\.json$/);
    expect(finalPath).not.toMatch(/\.tmp$/);
  });

  it('generates filename with timestamp and random suffix', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});

    emitEvent({ type: 'test' });

    const finalPath = renameSpy.mock.calls[0][1] as string;
    const filename = finalPath.split('/').pop()!;
    // Format: timestamp-random.json
    expect(filename).toMatch(/^\d+-[a-z0-9]+\.json$/);
  });

  it('silently fails on write errors', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('permission denied'); });
    // Should not throw
    expect(() => emitEvent({ type: 'test' })).not.toThrow();
  });

  it('silently fails on rename errors', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('rename fail'); });
    expect(() => emitEvent({ type: 'test' })).not.toThrow();
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run src/events.test.ts
```

Expected: 5 tests pass.

**Step 3: Commit**

```bash
git add src/events.test.ts
git commit -m "test: add events.ts tests (5 tests)

Covers atomic file writes, directory creation, filename format,
silent error handling."
```

---

### Task 3: IPC delegation and send_photo tests (src/ipc-delegation.test.ts)

**Files:**
- Create: `src/ipc-delegation.test.ts`

**Context:** The existing `src/ipc-auth.test.ts` tests task authorization. This file tests the delegation and send_photo IPC handlers added as customizations.

**Step 1: Write the test file**

Follow the exact pattern from `ipc-auth.test.ts`: import `processTaskIpc` and `IpcDeps`, set up mock groups and deps, call `processTaskIpc` directly.

Test groups:
- `delegate` type: auth (main only), missing fields rejected, target not found writes error result, success result written to input dir, error result written, events emitted
- `send_photo` type: auth (main can send anywhere, non-main restricted to own group), resolves container path to host path, missing fields rejected

Mock `fs.writeFileSync` and `fs.mkdirSync` to capture delegation result files. Mock `deps.sendPhoto` to verify it's called. Mock `deps.runDelegation` with `vi.fn()` returning success/error.

Use `_initTestDatabase()` in beforeEach. Set up MAIN_GROUP and OTHER_GROUP constants matching the ipc-auth pattern.

~15 tests.

**Step 2: Run tests**

```bash
npx vitest run src/ipc-delegation.test.ts
```

**Step 3: Commit**

```bash
git add src/ipc-delegation.test.ts
git commit -m "test: add IPC delegation and send_photo tests (15 tests)

Covers delegation auth, result file writes, error handling,
send_photo path resolution and authorization."
```

---

### Task 4: Extend DB tests (src/db.test.ts)

**Files:**
- Modify: `src/db.test.ts`

**Step 1: Add new test groups at the end of the file**

Add tests for email tracking functions and deleteSession. Follow existing patterns — use `_initTestDatabase()` (already called in beforeEach).

New describe blocks:
- `deleteSession` — stores a session, deletes it, verifies it's gone
- `isEmailProcessed` — returns false for new ID, true after markEmailProcessed
- `markEmailProcessed` — stores email record with correct fields
- `markEmailResponded` — updates response_sent flag from 0 to 1
- `storeMessageDirect` — stores message with all fields, retrieves correctly
- `updateChatName` — updates name without changing existing timestamp

Import the new functions: `deleteSession`, `setSession`, `getSession`, `isEmailProcessed`, `markEmailProcessed`, `markEmailResponded`, `storeMessageDirect`, `updateChatName`.

~8 tests.

**Step 2: Run tests**

```bash
npx vitest run src/db.test.ts
```

Expected: existing tests + 8 new tests all pass.

**Step 3: Commit**

```bash
git add src/db.test.ts
git commit -m "test: extend db.test.ts with email and session tests (+8 tests)

Covers deleteSession, email tracking (isProcessed, markProcessed,
markResponded), storeMessageDirect, updateChatName."
```

---

### Task 5: API server tests (src/api.test.ts)

**Files:**
- Create: `src/api.test.ts`

**Context:** This is the largest test file. Tests the HTTP API server by starting it on a random port and making real HTTP requests. Mock all DB functions and fs.

**Step 1: Write the test file**

Set up mocks BEFORE imports:
```typescript
vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({ NANOCLAW_API_KEY: 'test-key-123' })) }));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));
vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nanoclaw-test' }));
```

Mock DB functions to return predictable data:
```typescript
vi.mock('./db.js', () => ({
  getAllRegisteredGroups: vi.fn(() => ({
    'tg:123': { name: 'Main', folder: 'main', trigger: '@Sky', isMain: true, added_at: '2024-01-01', requiresTrigger: false },
  })),
  getAllTasks: vi.fn(() => [{ id: 'task-1', status: 'active' }]),
  getAllChats: vi.fn(() => [{ jid: 'tg:123', name: 'Main', last_message_time: '2024-01-01' }]),
  getMessagesSince: vi.fn(() => []),
  getTaskById: vi.fn(() => null),
  storeMessage: vi.fn(),
}));
```

Mock fs for IPC file writes, mock `isValidGroupFolder`.

Start server in `beforeAll`, close in `afterAll`. Use `makeRequest` helper (same as credential-proxy.test.ts).

Test groups (~30 tests):
- Auth: no token 401, wrong token 401, correct token 200
- GET /: returns status without auth
- GET /api/status: returns uptime, group count, task counts
- GET /api/groups: returns groups array
- GET /api/tasks: returns tasks
- GET /api/messages/:jid: returns messages, 404 for unknown
- POST /api/message: writes IPC file, 400 if missing fields
- POST /api/inject: calls storeMessage, 400/404 for invalid input
- POST /api/delegate: writes IPC task file, 400 if missing fields
- POST /api/tasks: writes IPC task file, 400 if missing fields
- PATCH /api/tasks/:id: 404 for unknown task
- CORS: OPTIONS returns 204 with correct headers
- 404: unknown route
- Todo proxy: /api/todos/* forwarding (mock MC server on another random port)

**Step 2: Run tests**

```bash
npx vitest run src/api.test.ts
```

**Step 3: Commit**

```bash
git add src/api.test.ts
git commit -m "test: add API server tests (30 tests)

Covers auth, all endpoints, CORS, 404, todo proxy, input validation.
Starts real HTTP server on random port with mocked DB/fs."
```

---

### Task 6: Mount security tests (src/mount-security.test.ts)

**Files:**
- Create: `src/mount-security.test.ts`

**Context:** Tests the security-critical mount validation. Must reset the cached allowlist between tests since the module caches on first load.

**Step 1: Write the test file**

Mock fs to control allowlist file content. Mock logger. Need to handle the module-level cache — either re-import per test or reset the cache. Simplest: mock `fs.readFileSync` to return different allowlist content per test, and use `vi.resetModules()` + dynamic import to reset cache.

Alternative: since the module caches, use `vi.mock` with a factory that allows changing the return value via a mutable object (same pattern as credential-proxy.test.ts).

Test groups (~20 tests):
- Blocked patterns: .ssh, .gnupg, .env, credentials, id_rsa, id_ed25519, private_key all blocked
- Path traversal: ../escape rejected, absolute path outside root rejected
- Allowed roots: path under allowed root accepted, path outside rejected
- Read-write: non-main forced readonly even if config says rw, main respects config
- Missing allowlist: loadMountAllowlist returns null, validateAdditionalMounts returns empty array
- Invalid JSON: malformed allowlist file handled gracefully
- generateAllowlistTemplate: returns valid parseable JSON

**Step 2: Run tests**

```bash
npx vitest run src/mount-security.test.ts
```

**Step 3: Commit**

```bash
git add src/mount-security.test.ts
git commit -m "test: add mount security tests (20 tests)

Covers blocked patterns, path traversal prevention, allowlist
validation, readonly enforcement, error handling."
```

---

### Task 7: Credential proxy todo route tests (src/credential-proxy-todo.test.ts)

**Files:**
- Create: `src/credential-proxy-todo.test.ts`

**Context:** Tests the `/api/todos/*` proxy route added to the credential proxy. Extends the existing credential-proxy.test.ts pattern but in a separate file for the customisation.

**Step 1: Write the test file**

Follow exact same pattern as `credential-proxy.test.ts`: mock env, start proxy on random port, create a mock MC server on another random port. The proxy should forward `/api/todos*` to the MC server instead of upstream.

Test groups (~8 tests):
- GET /api/todos forwarded to MC, response body matches
- POST /api/todos forwarded with request body intact
- Query params preserved (/api/todos?status=pending)
- PUT /api/todos/:id forwarded correctly
- MC unavailable returns 502
- Non-todo routes still go to upstream (not MC)
- Todo requests don't get API key injection (they're for MC, not Anthropic)

**Step 2: Run tests**

```bash
npx vitest run src/credential-proxy-todo.test.ts
```

**Step 3: Commit**

```bash
git add src/credential-proxy-todo.test.ts
git commit -m "test: add credential proxy todo route tests (8 tests)

Covers todo forwarding to MC, body/query passthrough, 502 on MC
down, non-todo routes still go upstream."
```

---

### Task 8: Container runner mount tests (src/container-runner-mounts.test.ts)

**Files:**
- Create: `src/container-runner-mounts.test.ts`
- Possibly modify: `src/container-runner.ts` (export `buildVolumeMounts` and `buildContainerArgs` if not already exported)

**Context:** The container-runner has private functions `buildVolumeMounts` and `buildContainerArgs`. To test them directly, they need to be exported. Check if they're exported; if not, add exports with `/** @internal */` comments (same pattern as `_initTestDatabase` in db.ts).

**Step 1: Export internal functions if needed**

Check `src/container-runner.ts` — if `buildVolumeMounts` and `buildContainerArgs` are not exported, add `export` keyword to both with `/** @internal - exported for testing */` comment.

**Step 2: Write the test file**

Mock fs.existsSync to control which directories "exist". Mock fs.readdirSync/cpSync for skill sync. Mock config values (TOME_DIR, DATA_DIR, GROUPS_DIR, etc.). Mock credential-proxy detectAuthMode. Mock container-runtime functions.

Test groups (~25 tests):
- TOME mount: present for main (rw), present for non-main (rw), absent if dir missing
- SSH mount: present (ro), absent if missing
- Gmail mount: present (rw), absent if missing
- Mission Control mount: present (rw), absent if missing
- .env shadow: /dev/null mounted over .env for main
- Main vs non-main: main gets project root (ro), non-main doesn't
- Global dir: non-main gets /workspace/global (ro), TOME overlays it (rw)
- Git env vars in container args
- Auth mode: API key vs OAuth placeholder env var
- TOME skill sync: copies skill dirs from TOME_DIR/skills/ into sessions dir
- Session settings.json: created with correct env vars (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS etc.)

**Step 3: Run tests**

```bash
npx vitest run src/container-runner-mounts.test.ts
```

**Step 4: Commit**

```bash
git add src/container-runner-mounts.test.ts src/container-runner.ts
git commit -m "test: add container runner mount tests (25 tests)

Covers TOME/SSH/Gmail/MC mounts, .env shadow, main vs non-main,
git env vars, auth mode, skill sync, session settings."
```

---

### Task 9: Email channel tests (src/email-channel.test.ts)

**Files:**
- Create: `src/email-channel.test.ts`

**Context:** The email channel uses a Gmail MCP client (child process). Mock `child_process.spawn` to simulate the MCP process. Test the exported functions.

**Step 1: Write the test file**

Mock child_process, fs, logger, config. Test `getContextKey` (pure function, easy), `sendEmailReply` and `searchNewEmails` (need MCP client mock).

For the MCP client mock: simulate the NDJSON protocol by having the mocked spawn return a readable/writable stream pair. Write JSON-RPC responses when requests arrive.

Test groups (~15 tests):
- getContextKey: thread mode returns threadId, sender mode returns sender email, single mode returns constant
- sendEmailReply: formats reply with Re: prefix, extracts email from "Name <email>", calls MCP tool
- searchNewEmails: queries Gmail MCP, filters by subject prefix trigger, returns EmailMessage[]
- Client lifecycle: startGmailClient spawns process, stopGmailClient kills it
- Error handling: MCP timeout after 30s, malformed response handled

**Step 2: Run tests**

```bash
npx vitest run src/email-channel.test.ts
```

**Step 3: Commit**

```bash
git add src/email-channel.test.ts
git commit -m "test: add email channel tests (15 tests)

Covers getContextKey, email reply formatting, Gmail MCP queries,
client lifecycle, timeout and error handling."
```

---

### Task 10: Final verification — run full suite

**Step 1: Run all tests**

```bash
npm test
```

Expected: ~423 tests across ~27 files, all passing.

**Step 2: Verify no regressions**

Check that all 281 original tests still pass alongside the new ones.

**Step 3: Final commit**

```bash
git add -A
git commit -m "test: comprehensive test suite complete (~142 new tests)

Pre-upgrade verification covering API server, container mounts,
mount security, credential proxy, events, env parsing, email
channel, IPC delegation. Total: ~423 tests."
git push origin main
```

---

## Task Summary

| Task | File | Tests | Dependencies |
|------|------|-------|-------------|
| 1 | env.test.ts | ~10 | None |
| 2 | events.test.ts | ~5 | None |
| 3 | ipc-delegation.test.ts | ~15 | None |
| 4 | db.test.ts (extend) | ~8 | None |
| 5 | api.test.ts | ~30 | None |
| 6 | mount-security.test.ts | ~20 | None |
| 7 | credential-proxy-todo.test.ts | ~8 | None |
| 8 | container-runner-mounts.test.ts | ~25 | May need export |
| 9 | email-channel.test.ts | ~15 | None |
| 10 | Full suite verification | 0 | All above |

Tasks 1-9 are independent and can be done in any order. Task 10 must be last.
