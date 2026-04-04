import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to reset module-level cache between test groups.
// The module caches `cachedAllowlist` and `allowlistLoadError` at module scope,
// so we use vi.resetModules() + dynamic import() to get a fresh module each time.

// Shared mock state
let mockExistsSync: ReturnType<typeof vi.fn>;
let mockReadFileSync: ReturnType<typeof vi.fn>;
let mockRealpathSync: ReturnType<typeof vi.fn>;

const FAKE_ALLOWLIST_PATH =
  '/home/testuser/.config/nanoclaw/mount-allowlist.json';

// Mock config before any imports
vi.mock('./config.js', () => ({
  MOUNT_ALLOWLIST_PATH: '/home/testuser/.config/nanoclaw/mount-allowlist.json',
}));

// Mock pino logger
vi.mock('pino', () => {
  const fakeLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { default: () => fakeLogger };
});

// Mock fs — we set up spy fns that each test group can configure
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  // These will be replaced per-test in beforeEach
  const existsSyncFn = vi.fn();
  const readFileSyncFn = vi.fn();
  const realpathSyncFn = vi.fn();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncFn,
      readFileSync: readFileSyncFn,
      realpathSync: realpathSyncFn,
    },
    existsSync: existsSyncFn,
    readFileSync: readFileSyncFn,
    realpathSync: realpathSyncFn,
  };
});

// Helper to get a fresh module (clears cache)
async function freshModule() {
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock('./config.js', () => ({
    MOUNT_ALLOWLIST_PATH: FAKE_ALLOWLIST_PATH,
  }));
  vi.doMock('pino', () => {
    const fakeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    return { default: () => fakeLogger };
  });

  // Set up fresh fs mock fns
  mockExistsSync = vi.fn();
  mockReadFileSync = vi.fn();
  mockRealpathSync = vi.fn();

  vi.doMock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
      ...actual,
      default: {
        ...actual,
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        realpathSync: mockRealpathSync,
      },
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      realpathSync: mockRealpathSync,
    };
  });

  const mod = await import('./mount-security.js');
  return mod;
}

// Helper: a valid allowlist for most tests
function makeAllowlist(overrides: Record<string, unknown> = {}) {
  return {
    allowedRoots: [
      {
        path: '/home/testuser/projects',
        allowReadWrite: true,
        description: 'Dev projects',
      },
      {
        path: '/home/testuser/docs',
        allowReadWrite: false,
        description: 'Docs read-only',
      },
    ],
    blockedPatterns: [],
    nonMainReadOnly: true,
    ...overrides,
  };
}

// Configure mocks to load a valid allowlist and resolve mount paths
function setupValidAllowlist(allowlist: unknown = makeAllowlist()) {
  mockExistsSync.mockImplementation((p: string) => {
    if (p === FAKE_ALLOWLIST_PATH) return true;
    // Default: path exists
    return true;
  });
  mockReadFileSync.mockImplementation((p: string) => {
    if (p === FAKE_ALLOWLIST_PATH) return JSON.stringify(allowlist);
    return '';
  });
  mockRealpathSync.mockImplementation((p: string) => p);
}

describe('loadMountAllowlist', () => {
  it('returns null when allowlist file does not exist', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(false);

    const result = mod.loadMountAllowlist();
    expect(result).toBeNull();
  });

  it('handles invalid JSON in allowlist file gracefully', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ not valid json !!!');

    const result = mod.loadMountAllowlist();
    expect(result).toBeNull();
  });

  it('returns null for missing allowedRoots array', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        allowedRoots: 'not-array',
        blockedPatterns: [],
        nonMainReadOnly: true,
      }),
    );

    const result = mod.loadMountAllowlist();
    expect(result).toBeNull();
  });
});

describe('Blocked patterns', () => {
  it('mount with .ssh in path is blocked', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/.ssh/config' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('.ssh');
  });

  it('mount with .gnupg in path is blocked', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/.gnupg' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('.gnupg');
  });

  it('mount with credentials in path is blocked', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/credentials' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('credentials');
  });

  it('mount with id_rsa in path is blocked', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/id_rsa' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('id_rsa');
  });

  it('mount with .env in path is blocked', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/.env' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('.env');
  });
});

describe('Path validation', () => {
  it('mount path outside allowed roots is rejected', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/var/outside/somefile' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not under any allowed root');
  });

  it('mount path under allowed root is accepted', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/myapp' },
      true,
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('/home/testuser/projects');
  });

  it('path traversal with .. in containerPath is rejected', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/myapp', containerPath: '../escape' },
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('mount with valid path returns correct containerPath', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/myapp', containerPath: 'myapp' },
      true,
    );
    expect(result.allowed).toBe(true);
    expect(result.resolvedContainerPath).toBe('myapp');
  });
});

describe('Read-write control', () => {
  it('non-main group forced readonly even if mount says readonly: false', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/myapp', readonly: false },
      false, // non-main
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(true);
  });

  it('main group respects readonly: false when allowedRoot.allowReadWrite is true', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateMount(
      { hostPath: '/home/testuser/projects/myapp', readonly: false },
      true, // main
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(false);
  });

  it('main group forced readonly when allowedRoot.allowReadWrite is false', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    // /home/testuser/docs has allowReadWrite: false in our fixture
    const result = mod.validateMount(
      { hostPath: '/home/testuser/docs/readme.txt', readonly: false },
      true, // main
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(true);
  });
});

describe('Missing/invalid allowlist', () => {
  it('loadMountAllowlist returns null when file does not exist', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(false);

    expect(mod.loadMountAllowlist()).toBeNull();
  });

  it('validateAdditionalMounts returns empty array when allowlist is missing', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(false);

    const result = mod.validateAdditionalMounts(
      [{ hostPath: '/some/path' }],
      'test-group',
      true,
    );
    expect(result).toEqual([]);
  });

  it('invalid JSON in allowlist file handled gracefully', async () => {
    const mod = await freshModule();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not-json{{{{');

    const result = mod.loadMountAllowlist();
    expect(result).toBeNull();
  });
});

describe('generateAllowlistTemplate', () => {
  it('returns valid parseable JSON string', async () => {
    const mod = await freshModule();

    const template = mod.generateAllowlistTemplate();
    const parsed = JSON.parse(template);

    expect(Array.isArray(parsed.allowedRoots)).toBe(true);
    expect(Array.isArray(parsed.blockedPatterns)).toBe(true);
    expect(typeof parsed.nonMainReadOnly).toBe('boolean');
  });
});

describe('Integration: validateAdditionalMounts', () => {
  it('filters blocked mounts from array', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateAdditionalMounts(
      [
        { hostPath: '/home/testuser/projects/.ssh/keys' },
        { hostPath: '/home/testuser/projects/myapp' },
      ],
      'test-group',
      true,
    );
    // .ssh should be blocked, myapp should pass
    expect(result).toHaveLength(1);
    expect(result[0].hostPath).toBe('/home/testuser/projects/myapp');
  });

  it('preserves valid mounts', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateAdditionalMounts(
      [
        { hostPath: '/home/testuser/projects/app1' },
        { hostPath: '/home/testuser/projects/app2' },
      ],
      'test-group',
      true,
    );
    expect(result).toHaveLength(2);
    expect(result[0].hostPath).toBe('/home/testuser/projects/app1');
    expect(result[1].hostPath).toBe('/home/testuser/projects/app2');
  });

  it('multiple mounts: some valid, some blocked — only valid ones returned', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateAdditionalMounts(
      [
        { hostPath: '/home/testuser/projects/good1' },
        { hostPath: '/home/testuser/projects/.gnupg' },
        { hostPath: '/home/testuser/projects/good2' },
        { hostPath: '/var/outside/unauthorized' },
      ],
      'test-group',
      true,
    );
    expect(result).toHaveLength(2);
    expect(result[0].hostPath).toBe('/home/testuser/projects/good1');
    expect(result[1].hostPath).toBe('/home/testuser/projects/good2');
  });

  it('empty mounts array returns empty array', async () => {
    const mod = await freshModule();
    setupValidAllowlist();

    const result = mod.validateAdditionalMounts([], 'test-group', true);
    expect(result).toEqual([]);
  });
});
