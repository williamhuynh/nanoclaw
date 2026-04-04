import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('./config.js', () => ({
  DATA_DIR: '/mock/data',
}));

import { emitEvent } from './events.js';

describe('emitEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates events directory recursively', () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined);

    emitEvent({ type: 'test' });

    expect(mkdirSpy).toHaveBeenCalledWith('/mock/data/events', {
      recursive: true,
    });
  });

  it('writes event as JSON with atomic temp+rename', () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockReturnValue(undefined);

    const event = { type: 'test', value: 42 };
    emitEvent(event);

    // writeFileSync should write to a .tmp file
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const writtenPath = writeSpy.mock.calls[0][0] as string;
    expect(writtenPath).toMatch(/\.json\.tmp$/);
    expect(writeSpy.mock.calls[0][1]).toBe(JSON.stringify(event));

    // renameSync should move .tmp to .json
    expect(renameSpy).toHaveBeenCalledTimes(1);
    const srcPath = renameSpy.mock.calls[0][0] as string;
    const destPath = renameSpy.mock.calls[0][1] as string;
    expect(srcPath).toMatch(/\.json\.tmp$/);
    expect(destPath).toMatch(/\.json$/);
    expect(destPath).not.toMatch(/\.tmp$/);
    expect(srcPath).toBe(`${destPath}.tmp`);
  });

  it('generates filename with timestamp and random suffix', () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockReturnValue(undefined);

    emitEvent({ type: 'test' });

    const destPath = renameSpy.mock.calls[0][1] as string;
    const filename = destPath.split('/').pop()!;
    // Pattern: digits-alphanumeric.json (e.g. 1711234567890-a1b2c3.json)
    expect(filename).toMatch(/^\d+-[a-z0-9]+\.json$/);
  });

  it('silently fails on mkdirSync error', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    // Should not throw
    expect(() => emitEvent({ type: 'test' })).not.toThrow();
    // Should not proceed to write since mkdir failed
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('silently fails on renameSync error', () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    // Should not throw
    expect(() => emitEvent({ type: 'test' })).not.toThrow();
  });
});
