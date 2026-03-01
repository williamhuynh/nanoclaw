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
