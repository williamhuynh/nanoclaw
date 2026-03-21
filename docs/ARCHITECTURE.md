# NanoClaw Architecture Principles

## Prefer Agent-Side Tools Over Core Engine Changes

When adding new capabilities, prefer saving data to the filesystem and letting the agent use its existing tools (Read, Bash, skills) rather than modifying the message pipeline, router, or container runner.

**Why:** The core engine (`src/types.ts`, `src/router.ts`, `src/container-runner.ts`, `container/agent-runner/`) is shared with upstream. Changes to these files create merge conflicts when pulling upstream updates. Agent-side approaches (filesystem + Read tool, CLAUDE.md instructions, skills) are modular and isolated.

**Example:** To support images, save the file to `groups/{name}/media/` and let the agent Read it — don't change `NewMessage`, `ContainerInput`, or `MessageStream` to support multimodal content blocks.

**When core changes ARE appropriate:**
- Bug fixes in core logic
- New channel implementations (these are additive files, not modifications)
- Security fixes
- Changes that upstream would also benefit from (contribute back)

## Customisation Points

The following core files have local customisations that must be reviewed when merging upstream:

| File | Customisation | Purpose |
|------|--------------|---------|
| `container/agent-runner/src/index.ts` | Usage metadata logging | Writes token/context usage to `/workspace/ipc/usage/` after each run for Mission Control telemetry |
| `src/ipc.ts` | Delegation command handler | Agent-to-agent delegation via orchestrator IPC |

When pulling upstream changes, check these files for merge conflicts and ensure customisations are preserved.
