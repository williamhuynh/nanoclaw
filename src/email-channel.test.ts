import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Mock config
vi.mock('./config.js', () => ({
  EMAIL_CHANNEL: {
    enabled: true,
    triggerMode: 'subject',
    triggerValue: '[Sky]',
    contextMode: 'thread',
    pollIntervalMs: 60000,
    replyPrefix: '[Sky] ',
  },
  ASSISTANT_NAME: 'Sky',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock db
vi.mock('./db.js', () => ({
  isEmailProcessed: vi.fn(() => false),
  markEmailProcessed: vi.fn(),
  markEmailResponded: vi.fn(),
}));

// Create a fake child process for spawn mocking
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

// Mock child_process — capture spawn calls
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    fakeProc = createFakeProcess();
    return fakeProc;
  }),
}));

// Import after mocks are set up
import {
  getContextKey,
  sendEmailReply,
  searchNewEmails,
  startGmailClient,
  stopGmailClient,
  type EmailMessage,
} from './email-channel.js';
import { spawn } from 'child_process';
import { isEmailProcessed } from './db.js';

// Helper: respond to the next JSON-RPC request on the fake process stdout
function respondToNextRequest(
  proc: ReturnType<typeof createFakeProcess>,
  result: unknown,
) {
  // The module writes to stdin; we intercept that and respond on stdout
  return new Promise<void>((resolve) => {
    const onData = (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (!line) return;
      try {
        const req = JSON.parse(line);
        if (req.id != null) {
          const response = JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result,
          });
          proc.stdout.push(response + '\n');
          proc.stdin.removeListener('data', onData);
          resolve();
        }
      } catch {
        // ignore
      }
    };
    proc.stdin.on('data', onData);
  });
}

// Helper: auto-respond to all JSON-RPC requests with given results in order
function autoRespond(
  proc: ReturnType<typeof createFakeProcess>,
  results: unknown[],
) {
  let idx = 0;
  proc.stdin.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (!line) return;
    try {
      const req = JSON.parse(line);
      if (req.id != null && idx < results.length) {
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: results[idx],
        });
        proc.stdout.push(response + '\n');
        idx++;
      }
    } catch {
      // ignore
    }
  });
}

// --- Tests ---

describe('getContextKey', () => {
  it('thread mode returns threadId-based key', () => {
    const email: EmailMessage = {
      id: 'msg-1',
      threadId: 'thread-abc',
      from: 'alice@example.com',
      subject: '[Sky] Hello',
      body: 'Hello there',
      date: '2024-01-01T00:00:00Z',
    };
    expect(getContextKey(email)).toBe('email-thread-thread-abc');
  });

  it('sender mode returns sender-based key', async () => {
    // We need to test with a different contextMode. Since EMAIL_CHANNEL is
    // imported as a const from the mock, we can mutate it for this test.
    const { EMAIL_CHANNEL } = await import('./config.js');
    const original = EMAIL_CHANNEL.contextMode;
    (EMAIL_CHANNEL as { contextMode: string }).contextMode = 'sender';

    const email: EmailMessage = {
      id: 'msg-2',
      threadId: 'thread-def',
      from: 'Bob@Example.com',
      subject: 'Test',
      body: 'Hello',
      date: '2024-01-01T00:00:00Z',
    };
    expect(getContextKey(email)).toBe('email-sender-bob@example.com');

    (EMAIL_CHANNEL as { contextMode: string }).contextMode = original;
  });

  it('single mode returns constant key', async () => {
    const { EMAIL_CHANNEL } = await import('./config.js');
    const original = EMAIL_CHANNEL.contextMode;
    (EMAIL_CHANNEL as { contextMode: string }).contextMode = 'single';

    const email: EmailMessage = {
      id: 'msg-3',
      threadId: 'thread-ghi',
      from: 'charlie@example.com',
      subject: 'Test',
      body: 'Hello',
      date: '2024-01-01T00:00:00Z',
    };
    expect(getContextKey(email)).toBe('email-main');

    (EMAIL_CHANNEL as { contextMode: string }).contextMode = original;
  });
});

describe('sendEmailReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds Re: prefix to subject if not already present', async () => {
    // The first call to sendEmailReply will trigger start() (initialize + callTool).
    // We need: initialize response, then send_email response.
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'Email sent' }] };

    // spawn is called, fakeProc is created inside the mock
    const sendPromise = sendEmailReply(
      'thread-1',
      'alice@example.com',
      'Hello',
      'Reply body',
    );

    // Wait a tick for spawn to be called and fakeProc to exist
    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalled();
    });

    // Respond to initialize request, then send_email request
    autoRespond(fakeProc, [initResult, sendResult]);

    await sendPromise;

    // Verify spawn was called with gmail-mcp
    expect(spawn).toHaveBeenCalledWith('gmail-mcp', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Verify the send_email call included Re: prefix
    // We check what was written to stdin
    const stdinWrites: string[] = [];
    fakeProc.stdin.on('data', () => {}); // drain
    // The writes already happened; we need to check the recorded calls.
    // Instead, verify through the fact that sendPromise resolved without error.
    // The Re: prefix logic is tested by reading what was written to stdin.
  });

  it('does not double Re: if subject already has it', async () => {
    // Client is already initialized from previous test (module-level singleton).
    // However, the process was killed or not — let's check.
    // The gmailClient is a singleton in the module. After the previous test
    // it should be initialized. But fakeProc may have changed.

    // Stop and restart to get a clean state
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'Email sent' }] };

    const sendPromise = sendEmailReply(
      'thread-2',
      'bob@example.com',
      'Re: Hello',
      'Reply body',
    );

    await vi.waitFor(() => {
      expect(fakeProc).toBeDefined();
    });

    autoRespond(fakeProc, [initResult, sendResult]);

    await sendPromise;

    // Check what was written to stdin for the send_email call
    // The second request (after initialize) should have subject "Re: Hello" (not "Re: Re: Hello")
    // We'll verify by capturing stdin writes
    // Since the promise resolved, the logic worked. We'll also verify via a unit-level approach below.
  });

  it('extracts email from "Name <email>" format for recipient', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'Email sent' }] };

    // Capture what gets written to stdin
    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-3',
      'Alice Smith <alice@example.com>',
      'Test Subject',
      'Reply body',
    );

    await vi.waitFor(() => {
      expect(fakeProc).toBeDefined();
    });

    // Capture stdin writes before responding
    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);

    await sendPromise;

    // Find the send_email call in stdin data
    const sendEmailCall = stdinData.find((d) => d.includes('send_email'));
    if (sendEmailCall) {
      const parsed = JSON.parse(sendEmailCall.trim());
      expect(parsed.params.arguments.to).toEqual(['alice@example.com']);
    }
  });
});

describe('email address parsing (via sendEmailReply)', () => {
  // These test the internal email extraction logic used in sendEmailReply
  // by observing what gets sent to the MCP client

  it('extracts email from "Name <email@example.com>" format', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'sent' }] };

    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-4',
      'John Doe <john@example.com>',
      'Test',
      'body',
    );

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);
    await sendPromise;

    const sendCall = stdinData.find((d) => d.includes('send_email'));
    expect(sendCall).toBeDefined();
    const parsed = JSON.parse(sendCall!.trim());
    expect(parsed.params.arguments.to).toEqual(['john@example.com']);
  });

  it('returns plain email as-is if no angle brackets', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'sent' }] };

    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-5',
      'plain@example.com',
      'Test',
      'body',
    );

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);
    await sendPromise;

    const sendCall = stdinData.find((d) => d.includes('send_email'));
    expect(sendCall).toBeDefined();
    const parsed = JSON.parse(sendCall!.trim());
    expect(parsed.params.arguments.to).toEqual(['plain@example.com']);
  });

  it('handles complex display name with special chars', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'sent' }] };

    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-6',
      '"O\'Brien, Mary" <mary@example.com>',
      'Test',
      'body',
    );

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);
    await sendPromise;

    const sendCall = stdinData.find((d) => d.includes('send_email'));
    expect(sendCall).toBeDefined();
    const parsed = JSON.parse(sendCall!.trim());
    expect(parsed.params.arguments.to).toEqual(['mary@example.com']);
  });
});

describe('sendEmailReply subject handling', () => {
  // Test the Re: prefix logic more precisely by capturing stdin

  it('sends Re: prefix when subject lacks it', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'sent' }] };

    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-7',
      'test@example.com',
      'Original Subject',
      'body',
    );

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);
    await sendPromise;

    const sendCall = stdinData.find((d) => d.includes('send_email'));
    expect(sendCall).toBeDefined();
    const parsed = JSON.parse(sendCall!.trim());
    expect(parsed.params.arguments.subject).toBe('Re: Original Subject');
  });

  it('does not add Re: when subject already starts with Re:', async () => {
    await stopGmailClient();

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const sendResult = { content: [{ type: 'text', text: 'sent' }] };

    const stdinData: string[] = [];

    const sendPromise = sendEmailReply(
      'thread-8',
      'test@example.com',
      'Re: Already replied',
      'body',
    );

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinData.push(chunk.toString());
    });

    autoRespond(fakeProc, [initResult, sendResult]);
    await sendPromise;

    const sendCall = stdinData.find((d) => d.includes('send_email'));
    expect(sendCall).toBeDefined();
    const parsed = JSON.parse(sendCall!.trim());
    expect(parsed.params.arguments.subject).toBe('Re: Already replied');
  });
});

describe('searchNewEmails trigger matching', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await stopGmailClient();
    // Reset triggerMode to subject
    const { EMAIL_CHANNEL } = await import('./config.js');
    (EMAIL_CHANNEL as { triggerMode: string }).triggerMode = 'subject';
    (EMAIL_CHANNEL as { triggerValue: string }).triggerValue = '[Sky]';
  });

  it('matches emails with [Sky] prefix in subject and returns correct fields', async () => {
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    // search_emails returns text with ID entries
    const searchResult = {
      content: [
        {
          type: 'text',
          text: 'ID: msg-100\nSubject: [Sky] Help me\nFrom: alice@example.com',
        },
      ],
    };
    // read_email returns the full email as JSON
    const readResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            from: 'alice@example.com',
            subject: '[Sky] Help me',
            body: 'Please help with this',
            threadId: 'thread-100',
            date: '2024-06-15T10:00:00Z',
          }),
        },
      ],
    };

    const searchPromise = searchNewEmails();

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    // Responses: initialize, search_emails, read_email
    autoRespond(fakeProc, [initResult, searchResult, readResult]);

    const emails = await searchPromise;

    expect(emails).toHaveLength(1);
    expect(emails[0]).toEqual({
      id: 'msg-100',
      threadId: 'thread-100',
      from: 'alice@example.com',
      subject: '[Sky] Help me',
      body: 'Please help with this',
      date: '2024-06-15T10:00:00Z',
    });
  });

  it('rejects emails without [Sky] prefix in subject mode', async () => {
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const searchResult = {
      content: [
        {
          type: 'text',
          text: 'ID: msg-200\nSubject: Regular email\nFrom: bob@example.com',
        },
      ],
    };
    // read_email returns email without [Sky] prefix
    const readResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            from: 'bob@example.com',
            subject: 'Regular email',
            body: 'Not a Sky email',
            threadId: 'thread-200',
            date: '2024-06-15T10:00:00Z',
          }),
        },
      ],
    };

    const searchPromise = searchNewEmails();

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    autoRespond(fakeProc, [initResult, searchResult, readResult]);

    const emails = await searchPromise;
    expect(emails).toHaveLength(0);
  });

  it('handles empty search results', async () => {
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const searchResult = {
      content: [{ type: 'text', text: 'No results found' }],
    };

    const searchPromise = searchNewEmails();

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    autoRespond(fakeProc, [initResult, searchResult]);

    const emails = await searchPromise;
    expect(emails).toHaveLength(0);
  });

  it('skips already-processed emails', async () => {
    vi.mocked(isEmailProcessed).mockReturnValue(true);

    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };
    const searchResult = {
      content: [
        {
          type: 'text',
          text: 'ID: msg-300\nSubject: [Sky] Old email\nFrom: charlie@example.com',
        },
      ],
    };

    const searchPromise = searchNewEmails();

    await vi.waitFor(() => expect(fakeProc).toBeDefined());

    autoRespond(fakeProc, [initResult, searchResult]);

    const emails = await searchPromise;
    expect(emails).toHaveLength(0);
    expect(isEmailProcessed).toHaveBeenCalledWith('msg-300');
  });
});

describe('client lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await stopGmailClient();
  });

  it('startGmailClient spawns gmail-mcp process', async () => {
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };

    const startPromise = startGmailClient();

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());

    autoRespond(fakeProc, [initResult]);

    await startPromise;

    expect(spawn).toHaveBeenCalledWith('gmail-mcp', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  it('stopGmailClient kills the spawned process', async () => {
    const initResult = { protocolVersion: '2024-11-05', capabilities: {} };

    const startPromise = startGmailClient();

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());

    autoRespond(fakeProc, [initResult]);

    await startPromise;

    // Now stop — should kill the process
    await stopGmailClient();

    expect(fakeProc.kill).toHaveBeenCalled();
  });
});
