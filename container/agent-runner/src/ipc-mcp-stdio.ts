/**
 * Stdio MCP Server for NanoClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { CronExpressionParser } from 'cron-parser';

// Todo API — routed through the credential proxy (port 3001) which is the only
// host port reliably reachable from containers. The proxy forwards /api/todos/*
// to Mission Control on localhost:3002.
const MC_HOST = 'host.docker.internal';
const MC_PORT = 3001;

function mcFetch(
  method: string,
  reqPath: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: MC_HOST,
        port: MC_PORT,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode!, data: text });
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy();
      reject(new Error('Mission Control request timed out'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function mcToolCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  errorLabel = 'Todo operation',
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const { data, status } = await mcFetch(method, path, body);
    if (status >= 400) return { content: [{ type: 'text', text: `Error: ${JSON.stringify(data)}` }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `${errorLabel} failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

// Context from environment variables (set by the agent runner)
const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  {
    text: z.string().describe('The message text to send'),
    sender: z
      .string()
      .optional()
      .describe(
        'Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.',
      ),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z
      .string()
      .describe(
        'What the agent should do when the task runs. For isolated mode, include all necessary context here.',
      ),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .describe(
        'cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time',
      ),
    schedule_value: z
      .string()
      .describe(
        'cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)',
      ),
    context_mode: z
      .enum(['group', 'isolated'])
      .default('group')
      .describe(
        'group=runs with chat history and memory, isolated=fresh session (include context in prompt)',
      ),
    target_group_jid: z
      .string()
      .optional()
      .describe(
        '(Main group only) JID of the group to schedule the task for. Defaults to the current group.',
      ),
    script: z
      .string()
      .optional()
      .describe(
        'Optional bash script to run before waking the agent. Script must output JSON on the last line of stdout: { "wakeAgent": boolean, "data"?: any }. If wakeAgent is false, the agent is not called. Test your script with bash -c "..." before scheduling.',
      ),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (
        /[Zz]$/.test(args.schedule_value) ||
        /[+-]\d{2}:\d{2}$/.test(args.schedule_value)
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".`,
            },
          ],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid =
      isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      type: 'schedule_task',
      taskId,
      prompt: args.prompt,
      script: args.script || undefined,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}`,
        },
      ],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter(
            (t: { groupFolder: string }) => t.groupFolder === groupFolder,
          );

      if (tasks.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const formatted = tasks
        .map(
          (t: {
            id: string;
            prompt: string;
            schedule_type: string;
            schedule_value: string;
            status: string;
            next_run: string;
          }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return {
        content: [
          { type: 'text' as const, text: `Scheduled tasks:\n${formatted}` },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} pause requested.`,
        },
      ],
    };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} resume requested.`,
        },
      ],
    };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} cancellation requested.`,
        },
      ],
    };
  },
);

server.tool(
  'update_task',
  'Update an existing scheduled task. Only provided fields are changed; omitted fields stay the same.',
  {
    task_id: z.string().describe('The task ID to update'),
    prompt: z.string().optional().describe('New prompt for the task'),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .optional()
      .describe('New schedule type'),
    schedule_value: z
      .string()
      .optional()
      .describe('New schedule value (see schedule_task for format)'),
    script: z
      .string()
      .optional()
      .describe(
        'New script for the task. Set to empty string to remove the script.',
      ),
  },
  async (args) => {
    // Validate schedule_value if provided
    if (
      args.schedule_type === 'cron' ||
      (!args.schedule_type && args.schedule_value)
    ) {
      if (args.schedule_value) {
        try {
          CronExpressionParser.parse(args.schedule_value);
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Invalid cron: "${args.schedule_value}".`,
              },
            ],
            isError: true,
          };
        }
      }
    }
    if (args.schedule_type === 'interval' && args.schedule_value) {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid interval: "${args.schedule_value}".`,
            },
          ],
          isError: true,
        };
      }
    }

    const data: Record<string, string | undefined> = {
      type: 'update_task',
      taskId: args.task_id,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };
    if (args.prompt !== undefined) data.prompt = args.prompt;
    if (args.script !== undefined) data.script = args.script;
    if (args.schedule_type !== undefined)
      data.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined)
      data.schedule_value = args.schedule_value;

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} update requested.`,
        },
      ],
    };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z
      .string()
      .describe(
        'The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")',
      ),
    name: z.string().describe('Display name for the group'),
    folder: z
      .string()
      .describe(
        'Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")',
      ),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
    requiresTrigger: z
      .boolean()
      .optional()
      .describe(
        'Whether messages must start with the trigger word. Default: false (respond to all messages). Set to true for busy groups with many participants where you only want the agent to respond when explicitly mentioned.',
      ),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Only the main group can register new groups.',
          },
        ],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      requiresTrigger: args.requiresTrigger ?? false,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Group "${args.name}" registered. It will start receiving messages immediately.`,
        },
      ],
    };
  },
);

server.tool(
  'send_photo',
  "Send a photo/image file to the user or group. The file must exist at the given path inside the container. Supported paths: /workspace/group/... (group files). Optional caption is sent as the photo caption.",
  {
    file_path: z.string().describe('Absolute path to the image file inside the container (e.g. /workspace/group/diagram.png)'),
    caption: z.string().optional().describe('Optional caption for the photo'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Sky"). Not used for the photo but logged.'),
  },
  async (args) => {
    if (!fs.existsSync(args.file_path)) {
      return {
        content: [{ type: 'text' as const, text: `File not found: ${args.file_path}` }],
        isError: true,
      };
    }

    const data: Record<string, string | undefined> = {
      type: 'send_photo',
      chatJid,
      filePath: args.file_path,
      caption: args.caption,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Photo queued for sending.' }] };
  },
);

server.tool(
  'delegate',
  `Delegate a task to a specialist agent. The specialist runs in its own container with dedicated context and expertise, then returns the result. Use this when a specialist agent is available for the task — check /workspace/ipc/available_agents.json for registered specialists.

The specialist has NO access to your conversation history. Include everything they need in the prompt: topic, context, constraints, and any prior feedback.

This tool blocks until the specialist completes (up to 10 minutes). The result is returned directly.`,
  {
    target_group: z.string().describe('The folder name of the target specialist agent (e.g., "linkedin-agent")'),
    prompt: z.string().describe('The full prompt for the specialist — include all context they need'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can delegate to other agents.' }],
        isError: true,
      };
    }

    const delegationId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Write delegation request to IPC tasks
    writeIpcFile(TASKS_DIR, {
      type: 'delegate',
      targetGroup: args.target_group,
      prompt: args.prompt,
      delegationId,
    });

    // Poll for result in IPC input directory
    const INPUT_DIR = path.join(IPC_DIR, 'input');
    const resultFile = path.join(INPUT_DIR, `delegation_${delegationId}.json`);
    const POLL_MS = 500;
    const TIMEOUT_MS = 600_000; // 10 minutes
    const start = Date.now();

    while (Date.now() - start < TIMEOUT_MS) {
      if (fs.existsSync(resultFile)) {
        try {
          const raw = fs.readFileSync(resultFile, 'utf-8');
          fs.unlinkSync(resultFile);
          const result = JSON.parse(raw);

          if (result.status === 'success' && result.result) {
            return {
              content: [{ type: 'text' as const, text: result.result }],
            };
          } else {
            return {
              content: [{ type: 'text' as const, text: `Delegation failed: ${result.error || 'No result returned'}` }],
              isError: true,
            };
          }
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error reading delegation result: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }

    return {
      content: [{ type: 'text' as const, text: `Delegation to "${args.target_group}" timed out after 10 minutes.` }],
      isError: true,
    };
  },
);

// --- Todo MCP Tools ---

server.tool(
  'todo_list',
  'List todos. Optionally filter by status, owner, horizon, or context.',
  {
    status: z.enum(['pending', 'in_progress', 'awaiting_review', 'completed', 'cancelled']).optional().describe('Filter: pending, in_progress, awaiting_review, completed, cancelled'),
    owner: z.string().optional().describe('Filter by owner: "human" or agent folder name'),
    horizon: z.enum(['today', 'this_week', 'soon', 'none']).optional().describe('Filter: today, this_week, soon, none'),
    context: z.enum(['work', 'personal', 'admin']).optional().describe('Filter: work, personal, admin'),
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.status) params.set('status', args.status);
    if (args.owner) params.set('owner', args.owner);
    if (args.horizon) params.set('horizon', args.horizon);
    if (args.context) params.set('context', args.context);
    const qs = params.toString();
    return mcToolCall('GET', `/api/todos${qs ? '?' + qs : ''}`, undefined, 'List todos');
  },
);

server.tool(
  'todo_get',
  'Get a single todo by ID, including its subtasks.',
  {
    id: z.string().describe('The todo ID'),
  },
  async (args) => mcToolCall('GET', `/api/todos/${args.id}`, undefined, 'Get todo'),
);

server.tool(
  'todo_create',
  'Create a new todo item.',
  {
    title: z.string().describe('Todo title'),
    description: z.string().optional().describe('Detailed description'),
    horizon: z.enum(['today', 'this_week', 'soon', 'none']).optional().describe('Time horizon'),
    owner: z.string().optional().describe('"human" or agent folder name'),
    context: z.enum(['work', 'personal', 'admin']).optional().describe('Category'),
    source: z.enum(['manual', 'brain_dump', 'agent', 'meeting', 'channel']).optional(),
    source_ref: z.string().optional().describe('Reference ID (meeting ID, message ID, etc.)'),
  },
  async (args) => mcToolCall('POST', '/api/todos', {
    title: args.title,
    description: args.description,
    horizon: args.horizon || 'none',
    owner: args.owner || 'human',
    context: args.context || 'work',
    source: args.source || 'agent',
    source_ref: args.source_ref,
  }, 'Create todo'),
);

server.tool(
  'todo_update',
  'Update a todo. Use to change status, owner, horizon, or add result_content.',
  {
    id: z.string().describe('The todo ID'),
    status: z.enum(['pending', 'in_progress', 'awaiting_review', 'completed', 'cancelled']).optional(),
    horizon: z.enum(['today', 'this_week', 'soon', 'none']).optional(),
    owner: z.string().optional().describe('"human" or agent folder name'),
    result_content: z.string().optional().describe('Agent output for review (markdown)'),
    description: z.string().optional(),
    context: z.enum(['work', 'personal', 'admin']).optional(),
  },
  async (args) => {
    const { id, ...updates } = args;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) body[k] = v;
    }
    return mcToolCall('PUT', `/api/todos/${id}`, body, 'Update todo');
  },
);

server.tool(
  'subtask_create',
  'Add a subtask to a todo.',
  {
    todo_id: z.string().describe('Parent todo ID'),
    title: z.string().describe('Subtask title'),
    owner: z.string().optional().describe('"human" or agent folder name'),
  },
  async (args) => mcToolCall('POST', `/api/todos/${args.todo_id}/subtasks`, {
    title: args.title,
    owner: args.owner || 'human',
  }, 'Create subtask'),
);

server.tool(
  'subtask_update',
  'Update a subtask status or title.',
  {
    todo_id: z.string().describe('Parent todo ID'),
    subtask_id: z.string().describe('Subtask ID'),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    title: z.string().optional(),
  },
  async (args) => {
    const body: Record<string, unknown> = {};
    if (args.status) body.status = args.status;
    if (args.title) body.title = args.title;
    return mcToolCall('PUT', `/api/todos/${args.todo_id}/subtasks/${args.subtask_id}`, body, 'Update subtask');
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
