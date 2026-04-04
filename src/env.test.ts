import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { readEnvFile } from './env.js';

describe('readEnvFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses KEY=value pairs', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO=bar\nBAZ=qux\n');
    const result = readEnvFile(['FOO', 'BAZ']);
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('only returns requested keys', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO=bar\nBAZ=qux\nEXTRA=nope\n');
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({ FOO: 'bar' });
    expect(result).not.toHaveProperty('BAZ');
    expect(result).not.toHaveProperty('EXTRA');
  });

  it('handles double-quoted values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('FOO="hello world"\n');
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('handles single-quoted values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue("FOO='hello world'\n");
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('skips lines starting with #', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# comment\nFOO=bar\n# another\n');
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('skips empty and blank lines', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('\n  \nFOO=bar\n\n');
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('returns empty object if .env file is missing', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const result = readEnvFile(['FOO']);
    expect(result).toEqual({});
  });

  it('skips lines without equals sign', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('NOEQUALSSIGN\nFOO=bar\n');
    const result = readEnvFile(['NOEQUALSSIGN', 'FOO']);
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('skips keys with empty values', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('EMPTY=\nFOO=bar\n');
    const result = readEnvFile(['EMPTY', 'FOO']);
    expect(result).toEqual({ FOO: 'bar' });
    expect(result).not.toHaveProperty('EMPTY');
  });

  it('does not write to process.env', () => {
    const envBefore = { ...process.env };
    vi.spyOn(fs, 'readFileSync').mockReturnValue('SECRET_KEY=supersecret\n');
    readEnvFile(['SECRET_KEY']);
    expect(process.env.SECRET_KEY).toBeUndefined();
    expect(process.env).toEqual(envBefore);
  });
});
