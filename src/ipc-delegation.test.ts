import { describe, it, expect, beforeEach, vi } from 'vitest';

import { _initTestDatabase, setRegisteredGroup } from './db.js';
import { processTaskIpc, processMessageIpc, IpcDeps } from './ipc.js';
import { RegisteredGroup } from './types.js';

// Mock fs so delegation result file writes don't touch disk
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
    },
  };
});

// Mock events so emitEvent calls are captured
vi.mock('./events.js', () => ({
  emitEvent: vi.fn(),
}));

// Mock config to avoid real paths
vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test-data',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'UTC',
}));

import fs from 'fs';
import { emitEvent } from './events.js';

// Set up registered groups used across tests
const MAIN_GROUP: RegisteredGroup = {
  name: 'Main',
  folder: 'whatsapp_main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
  isMain: true,
};

const OTHER_GROUP: RegisteredGroup = {
  name: 'Other',
  folder: 'other-group',
  trigger: '@Andy',
  added_at: '2024-01-01T00:00:00.000Z',
};

let groups: Record<string, RegisteredGroup>;
let deps: IpcDeps;

beforeEach(() => {
  _initTestDatabase();
  vi.clearAllMocks();

  groups = {
    'main@g.us': MAIN_GROUP,
    'other@g.us': OTHER_GROUP,
  };

  // Populate DB as well
  setRegisteredGroup('main@g.us', MAIN_GROUP);
  setRegisteredGroup('other@g.us', OTHER_GROUP);

  deps = {
    sendMessage: vi.fn(async () => {}),
    sendPhoto: vi.fn(async () => {}),
    registeredGroups: () => groups,
    registerGroup: (jid: string, group: RegisteredGroup) => {
      groups[jid] = group;
      setRegisteredGroup(jid, group);
    },
    syncGroups: async () => {},
    getAvailableGroups: () => [],
    writeGroupsSnapshot: () => {},
    onTasksChanged: () => {},
    runDelegation: vi.fn(async () => ({
      status: 'success' as const,
      result: 'mock delegation result',
    })),
  };
});

// --- Delegation authorization ---

describe('delegate authorization', () => {
  it('main group can delegate (no error)', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
        delegationId: 'del-1',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // runDelegation should have been called
    expect(deps.runDelegation).toHaveBeenCalledWith(
      'other-group',
      'do something',
    );
  });

  it('non-main group cannot delegate (blocked)', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'whatsapp_main',
        prompt: 'do something',
        delegationId: 'del-2',
      },
      'other-group',
      false,
      deps,
    );

    expect(deps.runDelegation).not.toHaveBeenCalled();
  });

  it('missing targetGroup rejected', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        prompt: 'do something',
        delegationId: 'del-3',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.runDelegation).not.toHaveBeenCalled();
  });

  it('missing prompt rejected', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        delegationId: 'del-4',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.runDelegation).not.toHaveBeenCalled();
  });

  it('missing delegationId rejected', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.runDelegation).not.toHaveBeenCalled();
  });
});

// --- Delegation result file writing ---

describe('delegate result files', () => {
  it('target group not found writes error result to input dir', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'nonexistent-group',
        prompt: 'do something',
        delegationId: 'del-notfound',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Should write error result directly (synchronous, no runDelegation)
    expect(deps.runDelegation).not.toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/tmp/nanoclaw-test-data/ipc/whatsapp_main/input',
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/nanoclaw-test-data/ipc/whatsapp_main/input/delegation_del-notfound.json',
      expect.stringContaining('"status":"error"'),
    );
    // Verify the written JSON content
    const written = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.type).toBe('delegation_result');
    expect(written.delegationId).toBe('del-notfound');
    expect(written.error).toContain('nonexistent-group');
  });

  it('successful delegation writes success result to input dir', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
        delegationId: 'del-success',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // The fire-and-forget promise resolves immediately with our mock
    // Wait for the microtask queue to flush (the .then() handler)
    await vi.waitFor(() => {
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/tmp/nanoclaw-test-data/ipc/whatsapp_main/input',
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/nanoclaw-test-data/ipc/whatsapp_main/input/delegation_del-success.json',
      expect.stringContaining('"status":"success"'),
    );
    const written = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.result).toBe('mock delegation result');
  });

  it('failed delegation writes error result to input dir', async () => {
    vi.mocked(deps.runDelegation).mockRejectedValueOnce(
      new Error('container crashed'),
    );

    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
        delegationId: 'del-fail',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Wait for the .catch() handler to run
    await vi.waitFor(() => {
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    const written = JSON.parse(
      vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.status).toBe('error');
    expect(written.error).toBe('container crashed');
    expect(written.result).toBeNull();
  });
});

// --- Delegation events ---

describe('delegate events', () => {
  it('delegation_started event emitted', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
        delegationId: 'del-evt-start',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delegation_started',
        sourceGroup: 'whatsapp_main',
        targetGroup: 'other-group',
        delegationId: 'del-evt-start',
      }),
    );
  });

  it('delegation_completed event emitted on success', async () => {
    await processTaskIpc(
      {
        type: 'delegate',
        targetGroup: 'other-group',
        prompt: 'do something',
        delegationId: 'del-evt-done',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Wait for the .then() handler
    await vi.waitFor(() => {
      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delegation_completed',
          sourceGroup: 'whatsapp_main',
          targetGroup: 'other-group',
          delegationId: 'del-evt-done',
          status: 'success',
        }),
      );
    });
  });
});

// --- Send photo authorization ---

describe('send_photo authorization', () => {
  it('main group can send photo to any JID', async () => {
    await processMessageIpc(
      {
        type: 'send_photo',
        chatJid: 'other@g.us',
        filePath: '/some/host/path/image.png',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.sendPhoto).toHaveBeenCalledWith(
      'other@g.us',
      '/some/host/path/image.png',
      undefined,
    );
  });

  it('non-main group can send photo to own group only', async () => {
    await processMessageIpc(
      {
        type: 'send_photo',
        chatJid: 'other@g.us',
        filePath: '/some/path/image.png',
      },
      'other-group',
      false,
      deps,
    );

    expect(deps.sendPhoto).toHaveBeenCalledWith(
      'other@g.us',
      '/some/path/image.png',
      undefined,
    );
  });

  it('non-main group blocked from sending to other group', async () => {
    await processMessageIpc(
      {
        type: 'send_photo',
        chatJid: 'main@g.us',
        filePath: '/some/path/image.png',
      },
      'other-group',
      false,
      deps,
    );

    expect(deps.sendPhoto).not.toHaveBeenCalled();
  });

  it('container path /workspace/group/ resolved to host path', async () => {
    await processMessageIpc(
      {
        type: 'send_photo',
        chatJid: 'main@g.us',
        filePath: '/workspace/group/output/chart.png',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // resolveGroupFolderPath('whatsapp_main') => '/tmp/nanoclaw-test-groups/whatsapp_main'
    // So /workspace/group/output/chart.png => /tmp/nanoclaw-test-groups/whatsapp_main/output/chart.png
    expect(deps.sendPhoto).toHaveBeenCalledWith(
      'main@g.us',
      '/tmp/nanoclaw-test-groups/whatsapp_main/output/chart.png',
      undefined,
    );
  });

  it('deps.sendPhoto called with correct args including caption', async () => {
    await processMessageIpc(
      {
        type: 'send_photo',
        chatJid: 'other@g.us',
        filePath: '/workspace/group/img.jpg',
        caption: 'Here is the chart',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.sendPhoto).toHaveBeenCalledWith(
      'other@g.us',
      '/tmp/nanoclaw-test-groups/whatsapp_main/img.jpg',
      'Here is the chart',
    );
  });
});
