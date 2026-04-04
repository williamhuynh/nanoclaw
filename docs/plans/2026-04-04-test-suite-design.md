# Comprehensive Test Suite — Design

*2026-04-04*

## Overview

Comprehensive unit + integration test suite to protect against regressions during upstream NanoClaw upgrades. Targets all customised core files and fills major coverage gaps in untested modules.

## Principles

- **Test by risk** — prioritise code that customisations modify and upstream could break
- **Mock external deps** — no running services needed, tests pass standalone
- **Follow existing patterns** — vitest, same mock style as current tests
- **Integration where it matters** — test module interactions, not just isolated functions

## Current State

- 281 tests across 19 files, all passing
- Major gaps: API server, mount security, container mounts, email channel, events, credential proxy todo route, env parsing
- Customised files documented in CUSTOMIZATIONS.md

## New Test Files

### 1. src/api.test.ts (~30 tests)

Tests the HTTP API server (src/api.ts).

**Approach:** Start server on random port in beforeAll, use fetch. Mock DB functions (getAllRegisteredGroups, getAllTasks, etc.) and fs for IPC writes.

| Group | Tests |
|-------|-------|
| Auth | No token → 401, wrong token → 401, correct token → 200, constant-time comparison |
| GET / | Returns name+status without auth |
| GET /api/status | Returns uptime, group count, active/total task count |
| GET /api/groups | Returns registered groups with jid, name, folder, isMain |
| GET /api/tasks | Returns scheduled tasks array |
| GET /api/messages/:jid | Returns messages for registered JID, 404 for unknown |
| POST /api/message | Writes IPC file, 400 if missing chatJid/text, uses main group folder |
| POST /api/inject | Stores message in DB, 400 if missing fields, 404 for unknown JID |
| POST /api/delegate | Writes IPC task file, 400 if missing fields, validates group folder |
| POST /api/tasks | Creates task via IPC, 400 if missing required fields |
| PATCH /api/tasks/:id | Pause/resume/cancel/update, 404 for unknown task |
| Todo proxy | Forwards /api/todos/* to MC, 502 if MC unavailable |
| CORS | OPTIONS returns correct headers, responses have CORS header |
| 404 | Unknown routes return not found |

### 2. src/container-runner-mounts.test.ts (~25 tests)

Tests custom volume mounts and container args (src/container-runner.ts).

**Approach:** Mock fs.existsSync and fs.readdirSync to control which dirs "exist". Call buildVolumeMounts and buildContainerArgs (need to export or test via runContainerAgent mock). Assert output arrays contain expected mounts.

| Group | Tests |
|-------|-------|
| TOME mount | Present for main (rw), present for non-main (rw), absent if dir missing |
| SSH mount | Present (ro), absent if ~/.ssh missing |
| Gmail mount | Present (rw), absent if ~/.gmail-mcp missing |
| Mission Control mount | Present (rw), absent if ~/apps/mission-control missing |
| .env shadow | /dev/null mounted over .env for main group |
| Git env vars | GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL in args |
| Main vs non-main | Main gets project root (ro) + group (rw); non-main gets group only (rw) + global (ro) |
| TOME skill sync | Skills copied from ~/tome/skills/ into session dir |
| Session dir | Created per group, settings.json has correct env vars |
| Auth mode | API key mode sets ANTHROPIC_API_KEY=placeholder; OAuth sets CLAUDE_CODE_OAUTH_TOKEN=placeholder |

### 3. src/mount-security.test.ts (~20 tests)

Tests volume mount validation (src/mount-security.ts).

**Approach:** Mock fs for allowlist file, test validateMount and validateAdditionalMounts directly.

| Group | Tests |
|-------|-------|
| Blocked patterns | .ssh blocked, .gnupg blocked, credentials blocked, id_rsa blocked, .env blocked |
| Path traversal | Rejects ../escape, /absolute/escape, symlinks outside allowed roots |
| Allowed roots | Accepts paths under allowed root, rejects paths outside |
| Read-write control | Non-main forced readonly, main respects config |
| Missing allowlist | Returns null, functions handle gracefully |
| Invalid allowlist | Malformed JSON handled, logs warning |
| Template | generateAllowlistTemplate returns valid JSON |

### 4. src/credential-proxy-todo.test.ts (~8 tests)

Tests the todo proxy route added to the credential proxy (src/credential-proxy.ts).

**Approach:** Start proxy on random port, mock MC on another port. Test /api/todos/* forwarding.

| Group | Tests |
|-------|-------|
| Todo proxy | GET /api/todos forwarded to MC, POST forwarded with body, query params preserved |
| MC unavailable | Returns 502 |
| Non-todo routes | Still forwarded to upstream (Anthropic API) |
| Auth injection | API key injected on non-todo routes, not on todo routes |

### 5. src/events.test.ts (~6 tests)

Tests event emission (src/events.ts).

**Approach:** Mock fs, verify file writes.

| Group | Tests |
|-------|-------|
| Emit | Writes JSON to data/events/ with atomic temp+rename |
| Filename | Timestamp + random suffix + .json |
| Directory | Creates events dir if missing |
| Silent fail | Errors swallowed (non-critical telemetry) |
| Content | Event data serialised correctly |
| Mkdir | Calls mkdirSync recursive |

### 6. src/env.test.ts (~10 tests)

Tests .env file parsing (src/env.ts).

**Approach:** Mock fs.readFileSync to return .env content.

| Group | Tests |
|-------|-------|
| Basic | Parses KEY=value pairs |
| Quoted | Handles double-quoted and single-quoted values |
| Selective | Only returns requested keys |
| Comments | Skips lines starting with # |
| Empty lines | Skips blank lines |
| Missing file | Returns empty object |
| No equals | Skips malformed lines |
| Whitespace | Trims keys and values |
| Empty values | Skips keys with empty values |
| Does not pollute | Does not write to process.env |

### 7. src/email-channel.test.ts (~15 tests)

Tests Gmail integration (src/email-channel.ts).

**Approach:** Mock the MCP client (child process spawn). Test searchNewEmails, sendEmailReply, getContextKey.

| Group | Tests |
|-------|-------|
| Search | Queries Gmail MCP, filters by trigger, returns EmailMessage[] |
| Trigger matching | Subject prefix match, label match, address match |
| Reply | Formats reply with Re: prefix, extracts email from "Name <email>" |
| Context key | Thread mode returns threadId, sender mode returns sender, single mode returns constant |
| Client lifecycle | startGmailClient spawns process, stopGmailClient kills it |
| Timeout | MCP requests timeout after 30s |
| Parse errors | Malformed MCP responses handled gracefully |

### 8. src/ipc-delegation.test.ts (~15 tests)

Tests delegation and send_photo IPC handling (src/ipc.ts).

**Approach:** Call processTaskIpc directly with mock deps, verify file writes and dep calls.

| Group | Tests |
|-------|-------|
| Delegate | Writes delegation result to source group's input/ dir |
| Delegate auth | Only main group can delegate, non-main blocked |
| Delegate missing fields | Rejects if targetGroup, prompt, or delegationId missing |
| Delegate target not found | Writes error result, doesn't crash |
| Delegate success | Result file contains status=success + result text |
| Delegate error | Result file contains status=error + error message |
| Send photo | Resolves /workspace/group path to host path |
| Send photo auth | Non-main can only send to own group, main can send anywhere |
| Send photo missing | Rejects if chatJid or filePath missing |
| Event emission | delegation_started and delegation_completed events emitted |

### 9. Extend existing: src/db.test.ts (+8 tests)

| Tests |
|-------|
| deleteSession removes session |
| isEmailProcessed returns false for new, true for processed |
| markEmailProcessed stores email record |
| markEmailResponded updates response_sent flag |
| processed_emails table created |
| storeMessageDirect works correctly |
| deleteTask removes run logs via cascade |
| updateChatName preserves existing timestamp |

### 10. Extend existing: src/container-runner.test.ts (+5 tests)

| Tests |
|-------|
| Session file > 2MB triggers fresh session |
| Prompt too long error clears session |
| Event emitted on container start |
| Event emitted on container complete |
| Tasks snapshot written before agent run |

## Test Count Summary

| File | New Tests |
|------|-----------|
| api.test.ts | ~30 |
| container-runner-mounts.test.ts | ~25 |
| mount-security.test.ts | ~20 |
| credential-proxy-todo.test.ts | ~8 |
| events.test.ts | ~6 |
| env.test.ts | ~10 |
| email-channel.test.ts | ~15 |
| ipc-delegation.test.ts | ~15 |
| db.test.ts (extend) | ~8 |
| container-runner.test.ts (extend) | ~5 |
| **Total** | **~142** |

Combined with existing 281 → ~423 tests.

## Out of Scope

- End-to-end tests requiring running services
- Frontend tests (Mission Control React app)
- Container agent-runner tests (separate package)
- Setup module tests (low upgrade risk)
- Performance/load testing
