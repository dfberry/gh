/**
 * Tests for executor module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFixPlans } from './executor.js';
import type { GitHubClient } from 'github-rest';
import type { FixPlan } from './types.js';

// Mock github-rest
vi.mock('github-rest', () => ({
  git: {
    createRef: vi.fn(),
  },
  contents: {
    createOrUpdateFile: vi.fn(),
    encodeContent: vi.fn((content: string) => Buffer.from(content).toString('base64')),
  },
  repos: {
    getRepo: vi.fn(),
    getDefaultBranchSHA: vi.fn(),
    findPRByBranch: vi.fn(),
    createPullRequest: vi.fn(),
  },
}));

describe('executor', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = { 
      request: vi.fn(),
      getRateLimit: vi.fn().mockResolvedValue({
        remaining: 1000,
        limit: 5000,
        resetAt: new Date(),
        used: 0,
      }),
    } as unknown as GitHubClient;
    vi.clearAllMocks();
  });

  describe('executeFixPlans - dry run', () => {
    it('returns created fixes in dry-run mode', async () => {
      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      const result = await executeFixPlans(mockClient, plans, true, false);

      expect(result.created).toHaveLength(1);
      expect(result.created[0]).toMatchObject({
        repo: 'org/repo1',
        category: 'missing-security-files',
        branch: 'autofix/test-20260307',
        filesModified: ['SECURITY.md'],
      });
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('does not call GitHub APIs in dry-run mode', async () => {
      const { git, contents, repos } = await import('github-rest');
      
      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      await executeFixPlans(mockClient, plans, true, false);

      expect(git.createRef).not.toHaveBeenCalled();
      expect(contents.createOrUpdateFile).not.toHaveBeenCalled();
      expect(repos.createPullRequest).not.toHaveBeenCalled();
    });
  });

  describe('executeFixPlans - apply mode', () => {
    it('skips forks', async () => {
      const { repos } = await import('github-rest');
      
      vi.mocked(repos.getRepo).mockResolvedValue({
        fork: true,
        owner: { login: 'org' },
        name: 'repo1',
        default_branch: 'main',
      } as any);

      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      const result = await executeFixPlans(mockClient, plans, false, false);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('fork');
      expect(result.created).toHaveLength(0);
    });

    it('skips repos with existing PRs', async () => {
      const { repos } = await import('github-rest');
      
      vi.mocked(repos.getRepo).mockResolvedValue({
        fork: false,
        owner: { login: 'org' },
        name: 'repo1',
        default_branch: 'main',
      } as any);
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(42);

      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      const result = await executeFixPlans(mockClient, plans, false, false);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('already exists');
      expect(result.created).toHaveLength(0);
    });

    it('creates branch and PR successfully', async () => {
      const { git, contents, repos } = await import('github-rest');
      
      vi.mocked(repos.getRepo).mockResolvedValue({
        fork: false,
        owner: { login: 'org' },
        name: 'repo1',
        default_branch: 'main',
      } as any);
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(null);
      vi.mocked(repos.getDefaultBranchSHA).mockResolvedValue('abc123');
      vi.mocked(git.createRef).mockResolvedValue({} as any);
      vi.mocked(contents.createOrUpdateFile).mockResolvedValue({} as any);
      vi.mocked(repos.createPullRequest).mockResolvedValue({
        number: 99,
        html_url: 'https://github.com/org/repo1/pull/99',
      } as any);

      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      const result = await executeFixPlans(mockClient, plans, false, false);

      expect(result.created).toHaveLength(1);
      expect(result.created[0]).toMatchObject({
        repo: 'org/repo1',
        prNumber: 99,
        prUrl: 'https://github.com/org/repo1/pull/99',
        branch: 'autofix/test-20260307',
        filesModified: ['SECURITY.md'],
      });
      
      expect(git.createRef).toHaveBeenCalledWith(
        mockClient,
        'org',
        'repo1',
        'refs/heads/autofix/test-20260307',
        'abc123',
      );
      expect(contents.createOrUpdateFile).toHaveBeenCalledWith(
        mockClient,
        'org',
        'repo1',
        'SECURITY.md',
        expect.objectContaining({
          message: 'test',
          branch: 'autofix/test-20260307',
        }),
      );
      expect(repos.createPullRequest).toHaveBeenCalledWith(
        mockClient,
        'org',
        'repo1',
        expect.objectContaining({
          title: '[auto-fix] Test',
          head: 'autofix/test-20260307',
          base: 'main',
        }),
      );
    });

    it('records errors and continues with other repos', async () => {
      const { repos } = await import('github-rest');
      
      vi.mocked(repos.getRepo).mockRejectedValue(new Error('Not found'));

      const plans: FixPlan[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          branch: 'autofix/test-20260307',
          prTitle: '[auto-fix] Test',
          prBody: 'Test body',
          templates: [
            { path: 'SECURITY.md', content: 'test', commitMessage: 'test' },
          ],
        },
      ];

      const result = await executeFixPlans(mockClient, plans, false, false);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        repo: 'org/repo1',
        category: 'missing-security-files',
        message: 'Not found',
      });
    });
  });
});
