/**
 * Tests for main orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoFixFindings } from './index.js';
import type { GitHubClient } from 'github-rest';
import type { SecurityAuditReport } from './types.js';

// Mock all dependencies
vi.mock('./executor.js', () => ({
  executeFixPlans: vi.fn().mockResolvedValue({
    created: [],
    skipped: [],
    errors: [],
  }),
}));

describe('index', () => {
  let mockClient: GitHubClient;

  beforeEach(() => {
    mockClient = { request: vi.fn() } as unknown as GitHubClient;
    vi.clearAllMocks();
  });

  describe('autoFixFindings', () => {
    it('returns empty result when no findings', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: true,
              dependabotYml: true,
            },
          },
        ],
      };

      const result = await autoFixFindings(
        mockClient,
        { security: securityReport },
        { dryRun: true },
      );

      expect(result.summary.totalPlanned).toBe(0);
      expect(result.summary.totalCreated).toBe(0);
    });

    it('uses dry-run mode by default', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const result = await autoFixFindings(mockClient, { security: securityReport });

      expect(result.dryRun).toBe(true);
    });

    it('uses apply mode when explicitly enabled', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const result = await autoFixFindings(
        mockClient,
        { security: securityReport },
        { apply: true },
      );

      expect(result.dryRun).toBe(false);
    });

    it('filters findings by category when specified', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const { executeFixPlans } = await import('./executor.js');

      await autoFixFindings(
        mockClient,
        { security: securityReport },
        { dryRun: true, categories: ['missing-security-files'] },
      );

      expect(executeFixPlans).toHaveBeenCalled();
      const plans = vi.mocked(executeFixPlans).mock.calls[0][1];
      expect(plans).toHaveLength(1);
      expect(plans[0].category).toBe('missing-security-files');
    });

    it('processes findings from multiple reports', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const healthReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo2',
            checks: {
              envExample: { pass: false },
            },
          },
        ],
      };

      const { executeFixPlans } = await import('./executor.js');

      await autoFixFindings(
        mockClient,
        { security: securityReport, health: healthReport },
        { dryRun: true },
      );

      expect(executeFixPlans).toHaveBeenCalled();
      const plans = vi.mocked(executeFixPlans).mock.calls[0][1];
      expect(plans.length).toBeGreaterThanOrEqual(2);
    });

    it('includes execution results in summary', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const { executeFixPlans } = await import('./executor.js');
      vi.mocked(executeFixPlans).mockResolvedValueOnce({
        created: [
          {
            repo: 'org/repo1',
            prNumber: 42,
            prUrl: 'https://github.com/org/repo1/pull/42',
            branch: 'autofix/test',
            category: 'missing-security-files',
            filesModified: ['SECURITY.md'],
          },
        ],
        skipped: [],
        errors: [],
      });

      const result = await autoFixFindings(
        mockClient,
        { security: securityReport },
        { dryRun: true },
      );

      expect(result.summary.totalCreated).toBe(1);
      expect(result.created).toHaveLength(1);
    });
  });
});
