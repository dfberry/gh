import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../lib/runtime-mode.js', () => ({ getMode: vi.fn() }));
vi.mock('fs/promises', () => ({ stat: vi.fn(async (p: string) => ({ isDirectory: () => false })), readdir: vi.fn(async () => []), writeFile: vi.fn(async () => {}) }));
vi.mock('../lib/github-repos.js', () => ({ fetchAuthenticatedUserRepoNames: vi.fn(), getDefaultBranch: vi.fn() }));
vi.mock('../lib/output.js', () => ({ writeNormalizedInput: vi.fn(async (outDir, name, repos) => `${outDir}/${name}`) }));
vi.mock('../lib/files.js', () => ({ ensureDir: vi.fn(async () => {}) }));
vi.mock('../lib/input-parser.js', () => ({ parseRepoInput: vi.fn(async (p) => ['selected/one']) }));
vi.mock('../lib/token-scopes.js', () => ({ fetchAndWriteTokenScopes: vi.fn(async () => []) }));

import { runGroupCommand } from './base.js';
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
