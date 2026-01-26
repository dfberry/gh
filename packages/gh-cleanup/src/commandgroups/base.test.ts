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

describe('runStepForEachRepo helper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
  });
});
