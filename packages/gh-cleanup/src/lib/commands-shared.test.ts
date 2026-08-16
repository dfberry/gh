import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('commands-shared.readInputRepos', () => {
  it('throws when input path is missing', async () => {
    const { readInputRepos } = await import('./commands-shared.js');
    await expect((readInputRepos as any)()).rejects.toThrow('Input file path is required to read input repositories.');
  });

  it('throws when input extension is not .json', async () => {
    const { readInputRepos } = await import('./commands-shared.js');
    await expect(readInputRepos('file.txt')).rejects.toThrow('Input file must be a JSON file with .json extension.');
  });

  it('throws when underlying readJsonFile rejects', async () => {
    const mock = vi.fn().mockRejectedValueOnce(new Error('not found'));
    vi.doMock('./files.js', () => ({ readJsonFile: mock }));
    const { readInputRepos } = await import('./commands-shared.js');
    await expect(readInputRepos('file.json')).rejects.toThrow('not found');
    expect(mock).toHaveBeenCalledWith('file.json');
  });

  it('throws when readJsonFile returns array with length = 0', async () => {
    const mock = vi.fn().mockResolvedValueOnce([]);
    vi.doMock('./files.js', () => ({ readJsonFile: mock }));
    const { readInputRepos } = await import('./commands-shared.js');
    await expect(readInputRepos('file.json')).rejects.toThrow('Expected input JSON to contain a single array of repository identifiers.');
  });

  it('returns the parsed value when readJsonFile returns an array with 5 items', async () => {
    const mock = vi.fn().mockResolvedValueOnce(['a','b','c','d','e']);
    vi.doMock('./files.js', () => ({ readJsonFile: mock }));
    const { readInputRepos } = await import('./commands-shared.js');
    const res = await readInputRepos('file.json');
    expect(res).toEqual(['a','b','c','d','e']);
    expect(mock).toHaveBeenCalledWith('file.json');
  });

  it('returns the parsed value when readJsonFile resolves to an object', async () => {
    const payload = { repos: ['x/y'] };
    const mock = vi.fn().mockResolvedValueOnce(payload);
    vi.doMock('./files.js', () => ({ readJsonFile: mock }));
    const { readInputRepos } = await import('./commands-shared.js');
    const res = await readInputRepos('file.json');
    expect(res).toEqual(payload);
    expect(mock).toHaveBeenCalledWith('file.json');
  });
});
