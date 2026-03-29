# Mission Control

Web-based dashboard and chat interface for NanoClaw. Messages come from the Mission Control web UI.

## Todo Tools

You have MCP tools for managing todos:
- `todo_list`, `todo_get`, `todo_create`, `todo_update`, `subtask_create`, `subtask_update`

When messages come from the todo page, they include `[Todo page]` at the start. These are ALWAYS about managing the todo list — creating, updating, or querying items. **Never execute the work described in a todo from the todo page.** Even if a todo is about this app (e.g. "update the todo UI"), just create the todo item. Execution happens separately when assigned.

## Editing Mission Control (General Chat Only)

The Mission Control app source is mounted at `/workspace/mission-control/` (read-write).

**Tech stack:** React 19, TypeScript, Tailwind CSS 4, Express 5, better-sqlite3, Vite

**Key paths:**
- Frontend pages: `/workspace/mission-control/src/frontend/pages/`
- Components: `/workspace/mission-control/src/frontend/components/`
- Server routes: `/workspace/mission-control/src/server/routes/`
- Server DB: `/workspace/mission-control/src/server/db.ts`

**To deploy changes:** After editing source files, run:
```bash
touch /workspace/mission-control/.deploy-trigger
```
This triggers a systemd path unit that rebuilds and restarts Mission Control automatically.

**Only make UI/code changes when the user explicitly asks.** Don't proactively redesign or refactor.
