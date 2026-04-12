---
type: infrastructure
last-updated: 2026-04-06
source: Sky conversation — email & calendar MCP setup
---

# Google Integrations

## Google Cloud Project

- **Project name**: `nanoclaw-488213`
- **Project number**: `215833867820`
- **APIs enabled**: Gmail API, Google Calendar API (`calendar-json.googleapis.com`)
- **OAuth type**: Desktop app credentials
- **Credentials file**: `~/.gmail-mcp/gcp-oauth.keys.json` (shared by both Gmail and Calendar MCPs)

---

## Gmail MCP

- **Package**: `@gongrzhe/server-gmail-autoauth-mcp` (installed globally in container)
- **Binary**: `gmail-mcp`
- **Credentials path (host)**: `~/.gmail-mcp/` (tokens + OAuth keys)
- **Credentials path (container)**: `/home/node/.gmail-mcp/` (mounted read-write for token refresh)
- **Authenticated account**: `sky.wh1291@gmail.com` — Sky's own email identity
- **Tools prefix**: `mcp__gmail__*`

### Email identity architecture
- `sky.wh1291@gmail.com` = Sky's own identity. This is the primary nanoclaw sending/receiving address. Not a workaround — it is the main account Sky operates from.
- `william.huynh12@gmail.com` = Will's personal Gmail. Sky has read/manage access via Calendar MCP auth but does NOT have a separate Gmail MCP connection to this account.
- Decision (2026-04-06): Will explicitly clarified that sky.wh1291 is Sky's identity, not a temporary workaround.

---

## Google Calendar MCP

- **Package**: `@cocal/google-calendar-mcp` v2.6.1 (nspady's package, published under `@cocal` org scope)
- **Binary**: `google-calendar-mcp`
- **Credentials path (host)**: `~/.google-calendar-mcp/` (tokens stored here)
- **Credentials path (container)**: `/home/node/.google-calendar-mcp/` (mounted read-write for token refresh)
- **Env var**: `GOOGLE_CALENDAR_MCP_TOKEN_PATH=/home/node/.google-calendar-mcp/`
- **Authenticated account**: `william.huynh12@gmail.com` — Will's personal account
- **Tools prefix**: `mcp__gcalendar__*`
- **Supports multiple accounts**: Yes, via `manage-accounts` tool

### Will's calendars
| Calendar | ID / Summary | Access | Notes |
|----------|-------------|--------|-------|
| Personal | `william.huynh12@gmail.com` | Owner | Primary calendar |
| Family | `family075...@group.calendar.google.com` | Owner | Shared family calendar |
| Holidays in Australia | `en.australian#holiday@group.v.calendar.google.com` | Reader | Auto-populated |
| Shared | `ppkw18@gmail.com` | Reader | Shared from ppkw18 |
| Will - Elysium | `96llhmpjs6...@import.calendar.google.com` | Reader | Imported work calendar |
| Will AiD - Main | `86g0sfb7...@import.calendar.google.com` | Reader | AiD/The OC work calendar |

---

## Technical implementation (nanoclaw container)

Changes made to support Calendar MCP (2026-04-06, via Claude Code):
- `container/Dockerfile`: added `@cocal/google-calendar-mcp` to `npm install -g`
- `src/container-runner.ts`: added mount block for `~/.google-calendar-mcp`
- `container/agent-runner/src/index.ts`: added `gcalendar` MCP server entry + `mcp__gcalendar__*` to allowed tools

---

## Timezone

- Sydney (Will's timezone): **AEST UTC+10** from April 5 — October (DST off)
- Sydney: **AEDT UTC+11** October — April (DST on)
- DST ended: April 5, 2026. Next transition: ~October 2026.
- Always convert UTC times using the correct offset — don't assume AEDT year-round.
