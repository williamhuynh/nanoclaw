import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted — these are available when vi.mock factories execute
// ---------------------------------------------------------------------------

const {
  existsSyncMock,
  mkdirSyncMock,
  writeFileSyncMock,
  readFileSyncMock,
  readdirSyncMock,
  statSyncMock,
  cpSyncMock,
  copyFileSyncMock,
  detectAuthModeMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn((_p: string) => false),
  mkdirSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(() => ''),
  readdirSyncMock: vi.fn(() => [] as string[]),
  statSyncMock: vi.fn(() => ({ isDirectory: () => false })),
  cpSyncMock: vi.fn(),
  copyFileSyncMock: vi.fn(),
  detectAuthModeMock: vi.fn(() => 'api-key' as const),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000,
  CREDENTIAL_PROXY_PORT: 3001,
  DATA_DIR: '/tmp/nanoclaw-test-data',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IDLE_TIMEOUT: 1800000,
  TIMEZONE: 'America/Los_Angeles',
  TOME_DIR: '/home/testuser/tome',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./events.js', () => ({
  emitEvent: vi.fn(),
}));

vi.mock('./credential-proxy.js', () => ({
  detectAuthMode: detectAuthModeMock,
}));

vi.mock('./container-runtime.js', () => ({
  CONTAINER_HOST_GATEWAY: 'host.docker.internal',
  CONTAINER_RUNTIME_BIN: 'docker',
  readonlyMountArgs: (host: string, container: string) => [
    '-v',
    `${host}:${container}:ro`,
  ],
  hostGatewayArgs: () => ['--add-host=host.docker.internal:host-gateway'],
  stopContainer: (name: string) => `docker stop -t 1 ${name}`,
}));

vi.mock('./group-folder.js', () => ({
  resolveGroupFolderPath: (folder: string) =>
    `/tmp/nanoclaw-test-groups/${folder}`,
  resolveGroupIpcPath: (folder: string) =>
    `/tmp/nanoclaw-test-data/ipc/${folder}`,
}));

vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
      writeFileSync: writeFileSyncMock,
      readFileSync: readFileSyncMock,
      readdirSync: readdirSyncMock,
      statSync: statSyncMock,
      cpSync: cpSyncMock,
      copyFileSync: copyFileSyncMock,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import type { RegisteredGroup } from './types.js';
import {
  buildVolumeMounts,
  buildContainerArgs,
  VolumeMount,
} from './container-runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_HOME = '/home/testuser';
const TOME_DIR = '/home/testuser/tome';
const PROJECT_ROOT = '/home/nanoclaw/nanoclaw';

const baseGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@bot',
  added_at: new Date().toISOString(),
};

/** Convenience: return true for the given paths, false otherwise. */
function mockExistingPaths(paths: string[]) {
  existsSyncMock.mockImplementation((p: string) => paths.includes(p));
}

/** Find a mount by containerPath substring */
function findMount(mounts: VolumeMount[], containerPathSubstr: string) {
  return mounts.find((m) => m.containerPath.includes(containerPathSubstr));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let savedHome: string | undefined;

beforeEach(() => {
  savedHome = process.env.HOME;
  process.env.HOME = TEST_HOME;
  vi.spyOn(process, 'cwd').mockReturnValue(PROJECT_ROOT);

  // Reset all fs mocks to safe defaults
  existsSyncMock.mockImplementation(() => false);
  mkdirSyncMock.mockReset();
  writeFileSyncMock.mockReset();
  readFileSyncMock.mockReturnValue('');
  readdirSyncMock.mockReturnValue([]);
  statSyncMock.mockReturnValue({ isDirectory: () => false });
  cpSyncMock.mockReset();
  detectAuthModeMock.mockReturnValue('api-key');
});

afterEach(() => {
  process.env.HOME = savedHome;
  vi.restoreAllMocks();
});

// ===========================================================================
// Volume mounts — TOME
// ===========================================================================

describe('Volume mounts — TOME', () => {
  it('TOME dir mounted rw for main group', () => {
    mockExistingPaths([TOME_DIR]);
    const mounts = buildVolumeMounts(baseGroup, true);
    const tome = findMount(mounts, '/workspace/global/tome');
    expect(tome).toBeDefined();
    expect(tome!.hostPath).toBe(TOME_DIR);
    expect(tome!.readonly).toBe(false);
  });

  it('TOME dir mounted rw for non-main group', () => {
    mockExistingPaths([TOME_DIR, '/tmp/nanoclaw-test-groups/global']);
    const mounts = buildVolumeMounts(baseGroup, false);
    const tome = findMount(mounts, '/workspace/global/tome');
    expect(tome).toBeDefined();
    expect(tome!.hostPath).toBe(TOME_DIR);
    expect(tome!.readonly).toBe(false);
  });

  it('TOME mount absent if dir does not exist', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, true);
    const tome = findMount(mounts, '/workspace/global/tome');
    expect(tome).toBeUndefined();
  });
});

// ===========================================================================
// Volume mounts — SSH
// ===========================================================================

describe('Volume mounts — SSH', () => {
  it('SSH dir mounted ro', () => {
    mockExistingPaths([`${TEST_HOME}/.ssh`]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const ssh = findMount(mounts, '/home/node/.ssh');
    expect(ssh).toBeDefined();
    expect(ssh!.readonly).toBe(true);
  });

  it('SSH mount absent if dir does not exist', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const ssh = findMount(mounts, '/home/node/.ssh');
    expect(ssh).toBeUndefined();
  });
});

// ===========================================================================
// Volume mounts — Gmail
// ===========================================================================

describe('Volume mounts — Gmail', () => {
  it('Gmail dir mounted rw', () => {
    mockExistingPaths([`${TEST_HOME}/.gmail-mcp`]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const gmail = findMount(mounts, '/home/node/.gmail-mcp');
    expect(gmail).toBeDefined();
    expect(gmail!.readonly).toBe(false);
  });

  it('Gmail mount absent if dir does not exist', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const gmail = findMount(mounts, '/home/node/.gmail-mcp');
    expect(gmail).toBeUndefined();
  });
});

// ===========================================================================
// Volume mounts — Mission Control
// ===========================================================================

describe('Volume mounts — Mission Control', () => {
  it('Mission Control dir mounted rw', () => {
    mockExistingPaths([`${TEST_HOME}/apps/mission-control`]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const mc = findMount(mounts, '/workspace/mission-control');
    expect(mc).toBeDefined();
    expect(mc!.readonly).toBe(false);
  });

  it('Mission Control mount absent if dir does not exist', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const mc = findMount(mounts, '/workspace/mission-control');
    expect(mc).toBeUndefined();
  });
});

// ===========================================================================
// Volume mounts — structure
// ===========================================================================

describe('Volume mounts — structure', () => {
  it('Main group gets project root ro', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, true);
    const projectRoot = mounts.find(
      (m) => m.containerPath === '/workspace/project',
    );
    expect(projectRoot).toBeDefined();
    expect(projectRoot!.readonly).toBe(true);
    expect(projectRoot!.hostPath).toBe(PROJECT_ROOT);
  });

  it('Main group gets .env shadow mount (/dev/null)', () => {
    mockExistingPaths([`${PROJECT_ROOT}/.env`]);
    const mounts = buildVolumeMounts(baseGroup, true);
    const envShadow = mounts.find(
      (m) => m.containerPath === '/workspace/project/.env',
    );
    expect(envShadow).toBeDefined();
    expect(envShadow!.hostPath).toBe('/dev/null');
    expect(envShadow!.readonly).toBe(true);
  });

  it('Main group gets group folder rw', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, true);
    const groupMount = mounts.find(
      (m) => m.containerPath === '/workspace/group',
    );
    expect(groupMount).toBeDefined();
    expect(groupMount!.readonly).toBe(false);
    expect(groupMount!.hostPath).toBe('/tmp/nanoclaw-test-groups/test-group');
  });

  it('Non-main group gets group folder rw only (no project root)', () => {
    mockExistingPaths([]);
    const mounts = buildVolumeMounts(baseGroup, false);
    const groupMount = mounts.find(
      (m) => m.containerPath === '/workspace/group',
    );
    expect(groupMount).toBeDefined();
    expect(groupMount!.readonly).toBe(false);

    const projectRoot = mounts.find(
      (m) => m.containerPath === '/workspace/project',
    );
    expect(projectRoot).toBeUndefined();
  });

  it('Non-main group gets global dir ro', () => {
    mockExistingPaths(['/tmp/nanoclaw-test-groups/global']);
    const mounts = buildVolumeMounts(baseGroup, false);
    const globalMount = mounts.find(
      (m) => m.containerPath === '/workspace/global',
    );
    expect(globalMount).toBeDefined();
    expect(globalMount!.readonly).toBe(true);
  });
});

// ===========================================================================
// Container args
// ===========================================================================

describe('Container args', () => {
  const stubMounts: VolumeMount[] = [
    {
      hostPath: '/tmp/nanoclaw-test-groups/test-group',
      containerPath: '/workspace/group',
      readonly: false,
    },
  ];

  it('GIT_AUTHOR_NAME env var present', async () => {
    const args = await buildContainerArgs(stubMounts, 'test-container');
    const idx = args.indexOf('GIT_AUTHOR_NAME=NanoClaw');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx - 1]).toBe('-e');
  });

  it('GIT_AUTHOR_EMAIL env var present', async () => {
    const args = await buildContainerArgs(stubMounts, 'test-container');
    const idx = args.indexOf(
      'GIT_AUTHOR_EMAIL=nanoclaw@users.noreply.github.com',
    );
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx - 1]).toBe('-e');
  });

  it('GIT_COMMITTER_NAME env var present', async () => {
    const args = await buildContainerArgs(stubMounts, 'test-container');
    const idx = args.indexOf('GIT_COMMITTER_NAME=NanoClaw');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx - 1]).toBe('-e');
  });

  it('GIT_COMMITTER_EMAIL env var present', async () => {
    const args = await buildContainerArgs(stubMounts, 'test-container');
    const idx = args.indexOf(
      'GIT_COMMITTER_EMAIL=nanoclaw@users.noreply.github.com',
    );
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx - 1]).toBe('-e');
  });

  it('API key mode sets ANTHROPIC_API_KEY=placeholder', async () => {
    detectAuthModeMock.mockReturnValue('api-key');
    const args = await buildContainerArgs(stubMounts, 'test-container');
    expect(args).toContain('ANTHROPIC_API_KEY=placeholder');
    expect(args).not.toContain('CLAUDE_CODE_OAUTH_TOKEN=placeholder');
  });

  it('OAuth mode sets CLAUDE_CODE_OAUTH_TOKEN=placeholder', async () => {
    detectAuthModeMock.mockReturnValue('oauth' as any);
    const args = await buildContainerArgs(stubMounts, 'test-container');
    expect(args).toContain('CLAUDE_CODE_OAUTH_TOKEN=placeholder');
    expect(args).not.toContain('ANTHROPIC_API_KEY=placeholder');
  });

  it('TZ env var set', async () => {
    const args = await buildContainerArgs(stubMounts, 'test-container');
    expect(args).toContain('TZ=America/Los_Angeles');
  });
});

// ===========================================================================
// TOME skill sync
// ===========================================================================

describe('TOME skill sync', () => {
  it('Skills copied from TOME_DIR/skills/ to session dir', () => {
    const tomeSkillsSrc = `${TOME_DIR}/skills`;

    existsSyncMock.mockImplementation((p: string) => {
      if (p === tomeSkillsSrc) return true;
      return false;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readdirSyncMock.mockImplementation(((p: any) => {
      if (String(p) === tomeSkillsSrc) return ['my-skill'];
      return [];
    }) as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statSyncMock.mockImplementation((() => ({
      isDirectory: () => true,
    })) as any);

    buildVolumeMounts(baseGroup, false);

    expect(cpSyncMock).toHaveBeenCalledWith(
      `${tomeSkillsSrc}/my-skill`,
      expect.stringContaining('my-skill'),
      { recursive: true },
    );
  });

  it('No error if TOME skills dir missing', () => {
    existsSyncMock.mockImplementation(() => false);
    expect(() => buildVolumeMounts(baseGroup, false)).not.toThrow();
    const tomeSkillCalls = cpSyncMock.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('tome'),
    );
    expect(tomeSkillCalls).toHaveLength(0);
  });
});

// ===========================================================================
// Session dir
// ===========================================================================

describe('Session dir', () => {
  it('Session dir created per group', () => {
    mockExistingPaths([]);
    buildVolumeMounts(baseGroup, false);

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      '/tmp/nanoclaw-test-data/sessions/test-group/.claude',
      { recursive: true },
    );
  });

  it('settings.json written with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', () => {
    existsSyncMock.mockImplementation(() => false);

    buildVolumeMounts(baseGroup, false);

    const settingsCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        String(call[0]).endsWith('settings.json'),
    );
    expect(settingsCall).toBeDefined();

    const written = JSON.parse(settingsCall![1] as string);
    expect(written.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
  });
});
