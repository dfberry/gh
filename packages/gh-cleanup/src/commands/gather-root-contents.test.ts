import { it, describe, expect, vi } from 'vitest';

import { makeRunner } from '../bin/commands.js';

describe('cli repo input test', () => {
  it('gather-root-contents is invoked once per repo via runner', async () => {
    const tmp = './tmp-gather-root-contents-input.json';
    const repos = ['org/one', 'org/two', 'org/three'];
    await (await import('fs/promises')).writeFile(tmp, JSON.stringify(repos), 'utf8');

    const spy = vi.fn(async (_argv: string[], _client?: any) => {});
    const mockImport = vi.fn(async (_: string) => ({ gatherRootContentsCommand: spy }));

    const runner = makeRunner('../commands/gather-root-contents.js', 'gatherRootContentsCommand', mockImport);
    const argv = [`--input=${tmp}`, '--out=./generated-test'];
    await runner(argv, {} as any);

    expect(spy.mock.calls.length).toBe(repos.length);

    await (await import('fs/promises')).unlink(tmp).catch(() => {});
  });
});
