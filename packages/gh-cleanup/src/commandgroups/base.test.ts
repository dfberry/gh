import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../lib/runtime-mode.js', () => ({ getMode: vi.fn() }));
vi.mock('fs/promises', () => ({ stat: vi.fn(async (p: string) => ({ isDirectory: () => false })), readdir: vi.fn(async () => []), writeFile: vi.fn(async () => {}) }));
vi.mock('../lib/github-repos.js', () => ({ fetchAuthenticatedUserRepoNames: vi.fn(), getDefaultBranch: vi.fn() }));
vi.mock('../lib/output.js', () => ({ writeNormalizedInput: vi.fn(async (outDir, name, repos) => `${outDir}/${name}`) }));
vi.mock('../lib/files.js', () => ({ ensureDir: vi.fn(async () => {}) }));
vi.mock('../lib/input-parser.js', () => ({ parseRepoInput: vi.fn(async (p) => ['selected/one']) }));
vi.mock('../lib/token-scopes.js', () => ({ fetchAndWriteTokenScopes: vi.fn(async () => []) }));

import { runGroupCommand, runStepForEachRepo } from './base.js';
import type { Params } from './base.js';
import { describe as _describe } from 'vitest';
// we'll dynamically import the helper to avoid TypeScript/ESM import issues in tests
import * as fs from 'fs/promises';
import { getMode } from '../lib/runtime-mode.js';
import { fetchAuthenticatedUserRepoNames } from '../lib/github-repos.js';
import { writeNormalizedInput } from '../lib/output.js';
import { parseRepoInput } from '../lib/input-parser.js';

describe('runGroupCommand mode handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes normalized input and returns repos in user mode', async () => {
    // arrange
    (getMode as any).mockReturnValue('user');
    (fetchAuthenticatedUserRepoNames as any).mockResolvedValue(['owner/repo']);

    const args = { out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    // act
    const res = await runGroupCommand(args, opts, client);

    // assert
    expect(res.mode).toBe('user');
    expect(res.repos).toContain('owner/repo');
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('uses selected input when mode is selected', async () => {
    (getMode as any).mockReturnValue('selected');
    // ensure mock returns expected repos (resetAllMocks clears implementations)
    (parseRepoInput as any).mockResolvedValue(['selected/one']);

    const args = { input: './active-sample-repos.json', out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    const res = await runGroupCommand(args, opts, client);

    expect(res.mode).toBe('selected');
    expect(res.repos).toContain('selected/one');
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('resolveReposForRun (single mode)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns single repo when --single provided with owner and repo', async () => {
    (getMode as any).mockReturnValue('selected');
    const args = { single: true, owner: 'solo', repo: 'one', out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    const res = await runGroupCommand(args, opts, client);
    expect(res.repos).toEqual(['solo/one']);
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('throws when --single set but owner or repo missing', async () => {
    (getMode as any).mockReturnValue('selected');
    const args = { single: true, out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    await expect(runGroupCommand(args, opts, client)).rejects.toThrow();
  });

  it('returns repos from fetchAuthenticatedUserRepoNames when mode is user', async () => {
    (getMode as any).mockReturnValue('user');
    (fetchAuthenticatedUserRepoNames as any).mockResolvedValue(['u/repo']);

    const args = { out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    const res = await runGroupCommand(args, opts, client);
    expect(res.repos).toEqual(['u/repo']);
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('reads repo list via parseRepoInput when mode is selected', async () => {
    (getMode as any).mockReturnValue('selected');
    (parseRepoInput as any).mockResolvedValue(['sel/repo']);

    const args = { input: './active-sample-repos.json', out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    const res = await runGroupCommand(args, opts, client);
    expect(res.repos).toEqual(['sel/repo']);
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('throws when selected mode and input directory has no JSON files', async () => {
    (getMode as any).mockReturnValue('selected');
    (fs.stat as any).mockResolvedValue({ isDirectory: () => true });
    (fs.readdir as any).mockResolvedValue([]);

    const args = { input: './some-dir', out: './generated-test', outPrefix: 'test' } as any;
    const opts = { groupName: 'g', defaultInput: 'active-sample-repos.json', normalizedInputSuffix: 'normalized', defaultOutPrefix: 'g', steps: [] } as any;
    const client = {} as any;

    await expect(runGroupCommand(args, opts, client)).rejects.toThrow();
  });
});

describe('runStepForEachRepo helper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('buildParamsForRepo constructs expected params object', async () => {
    const { buildParamsForRepo } = await import('./base.js');
    const args = { yes: true, force: false, debug: true } as any;
    const owner = 'owner';
    const repo = 'repo';
    const stepOut = './generated-test/repos/owner_repo/pref-test-step.json';
    const repoFull = 'owner/repo';

    // when forwardApply is false, dryRun should be true
    const params1: Params = buildParamsForRepo(args, owner, repo, stepOut, false, repoFull);
    expect(params1.args.owner).toBe(owner);
    expect(params1.args.repo).toBe(repo);
    expect(params1.args.out).toBe(stepOut);
    expect(params1.args.dryRun).toBe(true);
    expect(params1.args.yes).toBe(true);
    expect(params1.args.force).toBeUndefined();
    expect(params1.data.repos).toEqual([repoFull]);

    // when forwardApply is true and flags are not set, dryRun should be false
    const args2 = { yes: false, force: true } as any;
    const params2: Params = buildParamsForRepo(args2, owner, repo, stepOut, true, repoFull);
    expect(params2.args.dryRun).toBe(false);
    expect(params2.args.force).toBe(true);
  });

  it('runs step wrapper for each repo and records ok', async () => {
    const summary: any = { steps: [] };
    const s = { name: 'test-step', module: '../commands/dummy-step.js', wrapper: 'doIt' } as any;
    const repos = ['owner/repo'];

    // provide a virtual module for the dynamic import used by runStepForEachRepo
    vi.mock('../commands/dummy-step.js', () => ({
      doIt: vi.fn(async () => {}),
    }));

    const shouldAbort = await runStepForEachRepo(
      s,
      repos,
      {} as any,
      './generated-test',
      'pref',
      './normalized.json',
      false,
      { yes: false, force: false, continueOnError: false } as any,
      undefined,
      summary,
    );

    expect(shouldAbort).toBe(false);
    expect(summary.steps.find((x: any) => x.name === 'test-step' && x.repo === 'owner/repo')).toBeTruthy();
    // per-repo input/output should be written into a repo-specific directory
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
    expect((writeNormalizedInput as any).mock.calls[0][0]).toBe('./generated-test/repos/owner_repo');
    const stepEntry: any = summary.steps.find((x: any) => x.name === 'test-step' && x.repo === 'owner/repo');
    expect(stepEntry.file).toBe('./generated-test/repos/owner_repo/pref-test-step.json');
  });

  it('aborts when wrapper throws and continueOnError is false', async () => {
    const summary: any = { steps: [] };
    const s = { name: 'bad-step', module: '../commands/bad-step.js', wrapper: 'run' } as any;
    const repos = ['owner/repo'];

    vi.mock('../commands/bad-step.js', () => ({
      run: vi.fn(async () => {
        throw new Error('fail');
      }),
    }));

    const shouldAbort = await runStepForEachRepo(
      s,
      repos,
      {} as any,
      './generated-test',
      'pref',
      './normalized.json',
      false,
      { yes: false, force: false, continueOnError: false } as any,
      undefined,
      summary,
    );

    expect(shouldAbort).toBe(true);
    expect(summary.steps.find((x: any) => x.name === 'bad-step' && x.status === 'error')).toBeTruthy();
    // ensure per-repo directory was used for the normalized input
    expect((writeNormalizedInput as any).mock.calls.length).toBeGreaterThan(0);
    expect((writeNormalizedInput as any).mock.calls[0][0]).toBe('./generated-test/repos/owner_repo');
    const stepEntryErr: any = summary.steps.find((x: any) => x.name === 'bad-step' && x.status === 'error');
    expect(stepEntryErr.file).toBe('./generated-test/repos/owner_repo/pref-bad-step.json');
  });
});
