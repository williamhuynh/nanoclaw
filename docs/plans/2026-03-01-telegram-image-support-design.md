# Telegram Image & Document Support

## Problem

When users send photos or documents via Telegram, the agent only sees a text placeholder like `[Photo]` or `[Document: file.pdf]`. The actual media is never downloaded or made available to the agent. The agent cannot see or analyze images or read documents.

## Design

### Approach: Filesystem + Agent Read Tool

Rather than modifying the core message pipeline (types, router, container runner, agent runner) to support multimodal content blocks, we save media files to the group's filesystem and let the agent use its existing Read tool to view them.

This follows the architectural principle: **prefer agent-side tools over core engine changes**.

### Flow

1. User sends a photo or document in Telegram
2. Telegram channel handler calls grammY's `ctx.getFile()` to get the file metadata
3. Downloads the file to `groups/{name}/media/{type}-{messageId}.{ext}`
4. Message content becomes `[Photo: /workspace/group/media/photo-123.jpg] caption`
5. Agent sees the path in the message text
6. Agent uses the Read tool to view the image or document
7. Agent responds based on what it sees

### Changes

| File | Change |
|------|--------|
| `src/channels/telegram.ts` | Add `downloadAndStore` helper for photo and document handlers. Other media types stay as placeholders. |
| `groups/global/CLAUDE.md` | Add instruction telling agents to Read media file paths when they appear in messages. |
| `docs/ARCHITECTURE.md` | New file documenting the "agent-side tools over core engine changes" principle. |
| Skills (`customize`, `brainstorming`, `writing-plans`) | Reference `docs/ARCHITECTURE.md` when designing features. |

### What Stays the Same

- `src/types.ts` — `NewMessage` interface unchanged
- `src/router.ts` — `formatMessages` unchanged
- `src/container-runner.ts` — prompt handling unchanged
- `container/agent-runner/src/index.ts` — `ContainerInput`, `SDKUserMessage`, `MessageStream` all unchanged

### Media Storage

- Location: `groups/{name}/media/`
- Naming: `{type}-{messageId}.{ext}` (e.g. `photo-4521.jpg`, `doc-4522.pdf`)
- No cleanup/retention policy for now — add later if disk becomes an issue

### Supported Media Types

- Photos (`.jpg`) — Claude can view via Read tool
- Documents (original filename preserved in extension) — Claude can read PDFs, images, text files

### Not Supported (stays as placeholder)

- Video, voice, audio, stickers, location, contact — these remain `[Video]`, `[Voice message]`, etc.

## Merge Conflict Risk

**Minimal.** Only `telegram.ts` is modified, and only the photo/document handlers within the `storeNonText` section. The core engine files are untouched.
