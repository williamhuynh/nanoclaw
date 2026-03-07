import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Sentinel markers must match container-runner.ts
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000, // 30min
  DATA_DIR: '/tmp/nanoclaw-test-data',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IDLE_TIMEOUT: 1800000, // 30min
  TIMEZONE: 'America/Los_Angeles',
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

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      copyFileSync: vi.fn(),
    },
  };
});

// Mock mount-security
vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

// Create a controllable fake ChildProcess
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

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import { spawn } from 'child_process';
import fs from 'fs';
import { runContainerAgent, ContainerOutput } from './container-runner.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Andy',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: ContainerOutput,
) {
  const json = JSON.stringify(output);
  proc.stdout.push(`${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

describe('container-runner timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output with a result
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });

    // Let output processing settle
    await vi.advanceTimersByTimeAsync(10);

    // Fire the hard timeout (IDLE_TIMEOUT + 30s = 1830000ms)
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event (as if container was stopped by the timeout)
    fakeProc.emit('close', 137);

    // Let the promise resolve
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-123');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
  });

  it('timeout with no output resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // No output emitted — fire the hard timeout
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event
    fakeProc.emit('close', 137);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('normal exit after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-456',
    });

    await vi.advanceTimersByTimeAsync(10);

    // Normal exit (no timeout)
    fakeProc.emit('close', 0);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-456');
  });
});

describe('container-runner tome mount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('non-main group gets read-write tome mount when tome directory exists', async () => {
    // Make existsSync return true for paths containing 'global' and 'tome'
    const existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    existsSyncMock.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('global') && p.includes('tome')) {
        return true;
      }
      // Also return true for the global dir itself (needed for the global mount)
      if (typeof p === 'string' && p.endsWith('/global')) {
        return true;
      }
      return false;
    });

    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      { ...testInput, isMain: false },
      () => {},
      onOutput,
    );

    // Get the spawn args - use the latest call since previous tests also call spawn
    const spawnMock = spawn as ReturnType<typeof vi.fn>;
    const lastCallIdx = spawnMock.mock.calls.length - 1;
    const spawnArgs = spawnMock.mock.calls[lastCallIdx][1] as string[];

    // Find the tome mount in spawn args
    // Read-write mounts use: -v host:container (no :ro suffix)
    const tomeVolumeIdx = spawnArgs.findIndex(
      (arg: string) =>
        arg.includes('/global/tome') && arg.includes('/workspace/global/tome'),
    );
    expect(tomeVolumeIdx).toBeGreaterThan(-1);

    // Verify mount is NOT read-only (no :ro suffix)
    const tomeMount = spawnArgs[tomeVolumeIdx];
    expect(tomeMount).not.toContain(':ro');

    // Verify the format is -v host:container (read-write)
    expect(spawnArgs[tomeVolumeIdx - 1]).toBe('-v');

    // Clean up: emit output and close
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    // Reset the mock
    existsSyncMock.mockReturnValue(false);
  });

  it('main group gets read-write tome mount when tome directory exists', async () => {
    const existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    existsSyncMock.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('global') && p.includes('tome')) {
        return true;
      }
      // Return true for .env (shadow mount)
      if (typeof p === 'string' && p.endsWith('.env')) {
        return true;
      }
      return false;
    });

    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      { ...testInput, isMain: true },
      () => {},
      onOutput,
    );

    const spawnMock = spawn as ReturnType<typeof vi.fn>;
    const lastCallIdx = spawnMock.mock.calls.length - 1;
    const spawnArgs = spawnMock.mock.calls[lastCallIdx][1] as string[];

    // Find the tome mount in spawn args
    const tomeVolumeIdx = spawnArgs.findIndex(
      (arg: string) =>
        arg.includes('/global/tome') && arg.includes('/workspace/global/tome'),
    );
    expect(tomeVolumeIdx).toBeGreaterThan(-1);

    // Verify mount is NOT read-only
    const tomeMount = spawnArgs[tomeVolumeIdx];
    expect(tomeMount).not.toContain(':ro');

    // Verify -v flag
    expect(spawnArgs[tomeVolumeIdx - 1]).toBe('-v');

    // Clean up
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    existsSyncMock.mockReturnValue(false);
  });
});
