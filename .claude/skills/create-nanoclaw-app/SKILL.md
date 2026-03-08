---
name: create-nanoclaw-app
description: Create and manage NanoClaw apps via the companion service
---

# Create NanoClaw App

## When to use
When the user wants to create a new web application managed by the NanoClaw Apps platform, or manage existing apps (start, stop, redeploy, delete).

## Creating a new app

1. Ask the user for:
   - App name (lowercase, alphanumeric, hyphens only)
   - Brief description of what the app should do

2. Create the app via the companion service API:
   ```bash
   curl -X POST http://localhost:4000/api/apps \
     -H 'Content-Type: application/json' \
     -d '{"name": "APP_NAME"}'
   ```

3. The scaffold will be created at `/home/nanoclaw/apps/APP_NAME/`

4. Build and start the app:
   ```bash
   curl -X POST http://localhost:4000/api/apps/APP_NAME/start
   ```

5. The app will be accessible at `http://TAILSCALE_HOSTNAME:PORT`

## Managing apps

- List apps: `curl http://localhost:4000/api/apps`
- App details: `curl http://localhost:4000/api/apps/APP_NAME`
- Stop: `curl -X POST http://localhost:4000/api/apps/APP_NAME/stop`
- Redeploy: `curl -X POST http://localhost:4000/api/apps/APP_NAME/redeploy`
- Logs: `curl http://localhost:4000/api/apps/APP_NAME/logs`
- Delete: `curl -X DELETE http://localhost:4000/api/apps/APP_NAME`

## Modifying an app

To modify an existing app, edit files in `/home/nanoclaw/apps/APP_NAME/`, then commit:
```bash
cd /home/nanoclaw/apps/APP_NAME
git add -A && git commit -m "description of changes"
```
The file watcher will auto-redeploy the app within 5 seconds of the commit.

## App structure

Apps use React + Express + TypeScript:
```
apps/{name}/
├── src/server/index.ts    # Express API server
├── src/frontend/App.tsx   # React frontend entry
├── src/frontend/main.tsx  # React mount point
├── Dockerfile
└── CLAUDE.md              # App-specific memory
```
