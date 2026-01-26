import { it, describe, expect, vi } from 'vitest';

import { makeRunner } from '../bin/commands.js';

describe('cli repo input test', () => {
  it('gather-repo-secrets is invoked once per repo via runner', async () => {
    // Temporary input file created for the test. It contains a JSON array of repo
    // full names, for example:
    // ["org/one", "org/two", "org/three"]
    const tmp = './tmp-gather-repo-secrets-input.json';
    const repos = ['org/one', 'org/two', 'org/three'];
    await (await import('fs/promises')).writeFile(tmp, JSON.stringify(repos), 'utf8');

    const spy = vi.fn(async (_argv: string[], _client?: any) => {});
    const mockImport = vi.fn(async (_: string) => ({ repoSecretsCommand: spy }));

    const runner = makeRunner('../commands/gather-repo-secrets.js', 'repoSecretsCommand', mockImport);
    const argv = [`--input=${tmp}`, '--out=./generated-test'];
    await runner(argv, {} as any);

    expect(spy.mock.calls.length).toBe(repos.length);

    await (await import('fs/promises')).unlink(tmp).catch(() => {});
  });
});
