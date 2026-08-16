import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-friendly mocks for external modules used by tests
vi.mock('github-rest', () => ({ permissions: { getRepoActions: vi.fn() } }));
vi.mock('fs', () => ({ promises: { writeFile: vi.fn(async () => {}) } }));
vi.mock('../lib/input-parser.js', () => ({ parseRepoInput: vi.fn(async () => []) }));

import { actionsCommand } from './gather-actions.js';
import { permissions } from 'github-rest';
import { promises as fs } from 'fs';
import * as inputParser from '../lib/input-parser.js';
import { makeRunner } from '../bin/commands.js';

describe('gather-actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('actionsCommand(params) returns ok and writes output when permission call succeeds', async () => {
    (permissions.getRepoActions as any).mockResolvedValue({ enabled: true });
    const params = { args: { out: './generated-test/actions.json' }, data: { repos: ['owner/repo'] } } as any;
    const client = {} as any;

    const res = await actionsCommand(params, client);

    expect(Array.isArray(res)).toBe(true);
    expect(res[0].owner).toBe('owner');
    expect(res[0].repo).toBe('repo');
    expect(res[0].status).toBe('ok');
    expect((fs.writeFile as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('actionsCommand(params) returns error when permission call throws 403', async () => {
    const err: any = new Error('forbidden');
    err.status = 403;
    err.body = { message: 'Not allowed' };
    (permissions.getRepoActions as any).mockRejectedValue(err);

    const params = { args: { out: './generated-test/actions.json' }, data: { repos: ['owner/repo'] } } as any;
    const client = {} as any;

    const res = await actionsCommand(params, client);

    expect(Array.isArray(res)).toBe(true);
    expect(res[0].status).toBe('error');
    expect(res[0].message).toMatch(/Insufficient permissions/);
    expect((fs.writeFile as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('is invoked once per repo via CLI runner', async () => {
    const repos = ['org/one', 'org/two', 'org/three'];
    (inputParser.parseRepoInput as any).mockResolvedValue(repos);

    const spy = vi.fn(async (_argv: string[], _client?: any) => {});
    const mockImport = vi.fn(async (_: string) => ({ actionsCommand: spy }));

    const runner = makeRunner('../commands/gather-actions.js', 'actionsCommand', mockImport);
    const argv = [`--input=./tmp-gather-actions-input.json`, '--out=./generated-test'];
    await runner(argv, {} as any);

    expect(spy.mock.calls.length).toBe(repos.length);
  });
});
