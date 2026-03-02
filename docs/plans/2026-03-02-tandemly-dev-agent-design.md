# Tandemly Dev Agent — Design

## Overview

Add a new NanoClaw group (`tandemly-dev`) to provide autonomous development assistance for the Tandemly app (joint finance management for couples/families). Mirrors the existing `homeschoollms-dev` pattern.

## Project Context

- **App:** Tandemly (repo: `williamhuynh/financemanagementos`)
- **Frontend:** Next.js, deployed on Vercel
- **Database & Auth:** Appwrite
- **AI:** OpenRouter (model router)
- **Monitoring:** TBD (placeholder for future setup)

## Group Structure

```
groups/tandemly-dev/
├── CLAUDE.md          # Agent identity, project context, skills, autonomy policy
├── .github-token      # GitHub fine-grained PAT for williamhuynh/financemanagementos
├── conversations/     # Auto-created by NanoClaw
└── logs/              # Auto-created by NanoClaw
```

## CLAUDE.md Design

The agent CLAUDE.md follows the same structure as `homeschoollms-dev`:

| Field | Value |
|-------|-------|
| Agent name | Dev |
| Repo | `williamhuynh/financemanagementos` |
| Frontend | Next.js on Vercel |
| Backend | Explore on first session |
| Database | Appwrite |
| Auth | Appwrite |
| AI | OpenRouter |
| Monitoring | TBD |
| Channel | Telegram (separate group) |

### Shared Skills

References the same container skills:
- `/dev-tdd` — test-driven development
- `/dev-debugging` — systematic debugging
- `/dev-verify` — verification before completion
- `/dev-plan-and-propose` — plan and propose for non-trivial changes
- `/auto-fix` — tiered autonomy classification
- `/github-pr` — PR creation and management
- `/check-sentry` — placeholder, inactive until monitoring configured

### Tiered Autonomy

Same as AstraLearn:
- **Auto-Fix Tier:** <=20 lines, 1-2 files, clear root cause. PR + auto-merge after 1 hour unless user says "hold."
- **PR Tier:** Everything else. Requires human review.
- **Default:** PR tier when in doubt.

## Registration

1. Create a new Telegram group for Tandemly dev
2. Add the Sky bot to the group
3. Register it as `tandemly-dev` via NanoClaw

## Credentials

- `.github-token` — fine-grained PAT scoped to `williamhuynh/financemanagementos`
- Error monitoring tokens added later

## What's NOT Included

- Error monitoring setup (user will install separately)
- Scheduled tasks for error checking (added when monitoring is configured)
