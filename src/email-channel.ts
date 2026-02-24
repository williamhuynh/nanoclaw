/**
 * Email Channel for NanoClaw
 * Polls Gmail for emails matching a trigger and processes them through the agent.
 */
import { spawn, ChildProcess } from 'child_process';
import { EMAIL_CHANNEL } from './config.js';
import { isEmailProcessed, markEmailProcessed, markEmailResponded } from './db.js';
import { logger } from './logger.js';

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

// --- Gmail MCP Client ---

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class GmailMcpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private buffer = '';
  private pendingResolves = new Map<number, (value: unknown) => void>();
  private pendingRejects = new Map<number, (reason: Error) => void>();
  private initialized = false;

  async start(): Promise<void> {
    if (this.initialized) return;

    this.process = spawn('gmail-mcp', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('npm warn')) {
        logger.debug({ component: 'gmail-mcp' }, msg);
      }
    });

    this.process.on('close', (code) => {
      logger.warn({ code }, 'Gmail MCP process exited');
      this.initialized = false;
      this.process = null;
      // Reject all pending requests
      for (const [id, reject] of this.pendingRejects) {
        reject(new Error(`Gmail MCP process exited with code ${code}`));
        this.pendingResolves.delete(id);
      }
      this.pendingRejects.clear();
    });

    // Initialize the MCP connection
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nanoclaw-email-channel', version: '1.0' },
    });

    // Send initialized notification (no response expected)
    this.sendNotification('notifications/initialized');

    this.initialized = true;
    logger.info('Gmail MCP client started');
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }

  private processBuffer(): void {
    // Gmail MCP SDK 0.4.0 uses newline-delimited JSON (NDJSON), not Content-Length framing
    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) return;

      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const response: JsonRpcResponse = JSON.parse(line);
        if (response.id != null) {
          const resolve = this.pendingResolves.get(response.id);
          const reject = this.pendingRejects.get(response.id);
          this.pendingResolves.delete(response.id);
          this.pendingRejects.delete(response.id);

          if (response.error) {
            reject?.(new Error(`MCP error: ${response.error.message}`));
          } else {
            resolve?.(response.result);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private sendNotification(method: string): void {
    if (!this.process?.stdin?.writable) return;
    const message = JSON.stringify({ jsonrpc: '2.0', method }) + '\n';
    this.process.stdin.write(message);
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Gmail MCP process not running'));
        return;
      }

      const id = ++this.requestId;
      this.pendingResolves.set(id, resolve);
      this.pendingRejects.set(id, reject);

      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(message);

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingResolves.delete(id);
          this.pendingRejects.delete(id);
          reject(new Error(`Gmail MCP request timed out (method: ${method})`));
        }
      }, 30000);
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized) await this.start();
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result;
  }
}

// --- Email operations ---

const gmailClient = new GmailMcpClient();

function buildSearchQuery(): string {
  switch (EMAIL_CHANNEL.triggerMode) {
    case 'label':
      return `label:${EMAIL_CHANNEL.triggerValue} is:unread`;
    case 'address':
      return `to:${EMAIL_CHANNEL.triggerValue} is:unread`;
    case 'subject':
      return `subject:${EMAIL_CHANNEL.triggerValue} is:unread`;
  }
}

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
}

function extractText(result: unknown): string {
  const r = result as McpToolResult;
  if (r?.content) {
    return r.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}

function matchesTrigger(email: EmailMessage): boolean {
  if (EMAIL_CHANNEL.triggerMode !== 'subject') return true;
  // Gmail subject: search is fuzzy; enforce exact prefix match client-side
  return email.subject.toLowerCase().startsWith(EMAIL_CHANNEL.triggerValue.toLowerCase());
}

export async function searchNewEmails(): Promise<EmailMessage[]> {
  const query = buildSearchQuery();
  logger.debug({ query }, 'Searching for emails');

  const result = await gmailClient.callTool('search_emails', {
    query,
    maxResults: 10,
  });

  const text = extractText(result);
  const emails: EmailMessage[] = [];

  // Parse search results - MCP returns text with email summaries
  // Extract message IDs using text-format parsing (ID: xxx\nSubject: ...)
  const entries = text.split(/\n(?=ID:)/);
  for (const entry of entries) {
    const idMatch = entry.match(/^ID:\s*(\S+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (isEmailProcessed(id)) continue;

    const fullEmail = await readEmail(id);
    if (fullEmail && matchesTrigger(fullEmail)) {
      emails.push(fullEmail);
    }
  }

  return emails;
}

async function readEmail(messageId: string): Promise<EmailMessage | null> {
  try {
    const result = await gmailClient.callTool('read_email', { messageId });
    const text = extractText(result);

    // Parse email content from the MCP response
    let from = '';
    let subject = '';
    let body = '';
    let threadId = messageId;
    let date = new Date().toISOString();

    // Try JSON parse first
    try {
      const parsed = JSON.parse(text);
      from = parsed.from || parsed.sender || '';
      subject = parsed.subject || '';
      body = parsed.body || parsed.text || parsed.snippet || '';
      threadId = parsed.threadId || messageId;
      date = parsed.date || parsed.internalDate || date;
    } catch {
      // Parse from text format
      const fromMatch = text.match(/From:\s*(.+)/i);
      const subjectMatch = text.match(/Subject:\s*(.+)/i);
      const threadMatch = text.match(/Thread ID:\s*(.+)/i);
      const dateMatch = text.match(/Date:\s*(.+)/i);

      from = fromMatch?.[1]?.trim() || '';
      subject = subjectMatch?.[1]?.trim() || '';
      threadId = threadMatch?.[1]?.trim() || messageId;
      date = dateMatch?.[1]?.trim() || date;

      // Body is everything after the headers
      const bodyStart = text.indexOf('\n\n');
      body = bodyStart !== -1 ? text.slice(bodyStart + 2).trim() : text;
    }

    return { id: messageId, threadId, from, subject, body, date };
  } catch (err) {
    logger.error({ messageId, err }, 'Failed to read email');
    return null;
  }
}

export async function sendEmailReply(
  threadId: string,
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
): Promise<void> {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  // Extract email address from "Name <email>" format
  const emailMatch = to.match(/<([^>]+)>/);
  const toAddress = emailMatch ? emailMatch[1] : to;

  await gmailClient.callTool('send_email', {
    to: [toAddress],
    subject: replySubject,
    body,
    threadId,
    inReplyTo,
  });

  logger.info({ to: toAddress, subject: replySubject }, 'Email reply sent');
}

export function getContextKey(email: EmailMessage): string {
  switch (EMAIL_CHANNEL.contextMode) {
    case 'thread':
      return `email-thread-${email.threadId}`;
    case 'sender':
      return `email-sender-${email.from.toLowerCase()}`;
    case 'single':
      return 'email-main';
  }
}

export async function startGmailClient(): Promise<void> {
  await gmailClient.start();
}

export async function stopGmailClient(): Promise<void> {
  await gmailClient.stop();
}
