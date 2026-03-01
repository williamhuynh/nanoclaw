# Telegram Image & Document Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the Telegram channel to download photos and documents so the agent can view them with its Read tool.

**Architecture:** Save media files to the group's filesystem (`groups/{name}/media/`) and include the container-relative path in the message text. The agent uses its existing Read tool to view images/documents. No core engine changes.

**Tech Stack:** grammY 1.40, Node.js https module, fs/path

**Design doc:** `docs/plans/2026-03-01-telegram-image-support-design.md`

---

### Task 1: Create `docs/ARCHITECTURE.md`

**Files:**
- Create: `docs/ARCHITECTURE.md`

**Step 1: Write the architecture principles document**

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add architecture principles — prefer agent-side tools over core changes"
```

---

### Task 2: Add `downloadMedia` helper to Telegram channel

**Files:**
- Modify: `src/channels/telegram.ts:1-3` (imports)
- Modify: `src/channels/telegram.ts:20-30` (add helper method to class)

**Step 1: Add imports**

At the top of `src/channels/telegram.ts`, add `fs`, `path`, and `stream/promises` imports. The file already imports `https`. Add after line 1:

```typescript
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
```

Also add the group folder resolver import after the existing imports:

```typescript
import { resolveGroupFolderPath } from '../group-folder.js';
```

**Step 2: Add `downloadMedia` private method to `TelegramChannel` class**

Add this method inside the class, after the `botToken` field declaration (after line 29):

```typescript
  /**
   * Download a file from Telegram and save it to the group's media folder.
   * Returns the container-relative path (e.g. /workspace/group/media/photo-123.jpg)
   * or null if download fails.
   */
  private async downloadMedia(
    ctx: any,
    group: RegisteredGroup,
    type: 'photo' | 'doc',
  ): Promise<string | null> {
    try {
      const file = await ctx.getFile();
      if (!file.file_path) return null;

      // Determine extension from Telegram's file_path
      const ext = path.extname(file.file_path) || '.jpg';
      const msgId = ctx.message.message_id;
      const filename = `${type}-${msgId}${ext}`;

      // Save to groups/{folder}/media/
      const groupDir = resolveGroupFolderPath(group.folder);
      const mediaDir = path.join(groupDir, 'media');
      fs.mkdirSync(mediaDir, { recursive: true });
      const destPath = path.join(mediaDir, filename);

      // Download via Telegram Bot API
      const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
      await new Promise<void>((resolve, reject) => {
        https.get(url, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: ${res.statusCode}`));
            return;
          }
          const ws = fs.createWriteStream(destPath);
          res.pipe(ws);
          ws.on('finish', () => resolve());
          ws.on('error', reject);
        }).on('error', reject);
      });

      // Return container-relative path
      return `/workspace/group/media/${filename}`;
    } catch (err) {
      logger.error({ err }, 'Failed to download Telegram media');
      return null;
    }
  }
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/channels/telegram.ts
git commit -m "feat(telegram): add downloadMedia helper for photos and documents"
```

---

### Task 3: Wire photo and document handlers to download media

**Files:**
- Modify: `src/channels/telegram.ts:160-169` (photo and document handlers)

**Step 1: Replace the photo handler**

Replace line 160:
```typescript
    this.bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
```

With:
```typescript
    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const mediaPath = await this.downloadMedia(ctx, group, 'photo');
      const placeholder = mediaPath ? `[Photo: ${mediaPath}]` : '[Photo]';
      storeNonText(ctx, placeholder);
    });
```

**Step 2: Replace the document handler**

Replace lines 166-169:
```typescript
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
```

With:
```typescript
    this.bot.on('message:document', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const name = ctx.message.document?.file_name || 'file';
      const mediaPath = await this.downloadMedia(ctx, group, 'doc');
      const placeholder = mediaPath
        ? `[Document: ${name} — ${mediaPath}]`
        : `[Document: ${name}]`;
      storeNonText(ctx, placeholder);
    });
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/channels/telegram.ts
git commit -m "feat(telegram): download photos and documents, include path in message"
```

---

### Task 4: Add agent hint to global CLAUDE.md

**Files:**
- Modify: `groups/global/CLAUDE.md`

**Step 1: Add media instructions**

Add this section at the end of `groups/global/CLAUDE.md`:

```markdown

## Media Files

When a message contains a file path like `[Photo: /workspace/group/media/...]` or `[Document: filename — /workspace/group/media/...]`, use the Read tool to view the file before responding. The Read tool supports images (JPG, PNG) and documents (PDF, text files).
```

**Step 2: Commit**

```bash
git add groups/global/CLAUDE.md
git commit -m "feat: instruct agents to Read media file paths from messages"
```

---

### Task 5: Update skills to reference `docs/ARCHITECTURE.md`

**Files:**
- Modify: `.claude/skills/customize/SKILL.md`
- Modify: `.claude/skills/brainstorming/SKILL.md`
- Modify: `.claude/skills/writing-plans/SKILL.md`

**Step 1: Add architecture reference to customize skill**

In `.claude/skills/customize/SKILL.md`, add after line 8 (after "Use AskUserQuestion to understand what they want before making changes."):

```markdown

**Before proposing changes, read `docs/ARCHITECTURE.md`** for architectural principles (e.g., prefer agent-side tools over core engine changes).
```

**Step 2: Add architecture reference to brainstorming skill**

In `.claude/skills/brainstorming/SKILL.md`, add to the "Exploring approaches" section (after "Lead with your recommended option and explain why"):

```markdown
- Check `docs/ARCHITECTURE.md` for architectural principles that may constrain your approach
```

**Step 3: Add architecture reference to writing-plans skill**

In `.claude/skills/writing-plans/SKILL.md`, add after the "Remember" section items (after "DRY, YAGNI, TDD, frequent commits"):

```markdown
- Check `docs/ARCHITECTURE.md` for architectural constraints
```

**Step 4: Commit**

```bash
git add .claude/skills/customize/SKILL.md .claude/skills/brainstorming/SKILL.md .claude/skills/writing-plans/SKILL.md
git commit -m "chore: reference docs/ARCHITECTURE.md from development skills"
```

---

### Task 6: Build and manual test

**Files:** None (verification only)

**Step 1: Build**

Run: `npm run build`
Expected: Clean compilation, no errors

**Step 2: Manual test**

Restart the service and send a photo via Telegram to a registered chat. Verify:
1. The photo downloads to `groups/{name}/media/photo-{msgId}.jpg`
2. The agent receives `[Photo: /workspace/group/media/photo-{msgId}.jpg] caption`
3. The agent reads the image and responds about its contents

Run:
```bash
systemctl --user restart nanoclaw
```

Then send a test photo via Telegram and check logs:
```bash
journalctl --user -u nanoclaw -f
```

**Step 3: Verify media file exists**

```bash
ls -la groups/*/media/
```
Expected: Photo file(s) present with correct naming

**Step 4: Clean up design doc (optional)**

The design doc at `docs/plans/2026-03-01-telegram-image-support-design.md` can remain for reference.
