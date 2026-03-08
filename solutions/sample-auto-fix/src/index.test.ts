/**
 * Tests for main orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoFixFindings } from './index.js';
import type { GitHubClient } from 'github-rest';
import type { SecurityAuditReport, AzureBestPracticesReport } from './types.js';

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
    it('returns result with allFindings when no auto-fixable findings', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            score: 65,
            branchProtection: { protected: false },
            automatedSecurityFixes: { enabled: false },
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
      // Should still report non-fixable findings
      expect(result.allFindings).toBeDefined();
      expect(result.allFindings!.length).toBeGreaterThan(0);
      expect(result.summary.totalManualAction).toBeGreaterThan(0);
    });

    it('uses dry-run mode by default', async () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'config', signal: 'security_policy_present', passed: false, weight: 5, earned: 0 },
            ],
          },
        ],
      };

      const result = await autoFixFindings(mockClient, { azure: azureReport });

      expect(result.dryRun).toBe(true);
    });

    it('uses apply mode when explicitly enabled', async () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
            ],
          },
        ],
      };

      const result = await autoFixFindings(
        mockClient,
        { azure: azureReport },
        { apply: true },
      );

      expect(result.dryRun).toBe(false);
    });

    it('classifies findings correctly in summary', async () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            branchProtection: { protected: false },
          },
        ],
      };

      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'security', signal: 'managed_identity_documented', passed: false, weight: 8, earned: 0 },
            ],
          },
        ],
      };

      const result = await autoFixFindings(
        mockClient,
        { security: securityReport, azure: azureReport },
        { dryRun: true },
      );

      expect(result.summary.totalAutoFixable).toBeGreaterThanOrEqual(1);
      expect(result.summary.totalManualAction).toBeGreaterThanOrEqual(1);
      expect(result.allFindings).toBeDefined();
    });

    it('processes azure BP findings with checks array', async () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'config', signal: 'env_example_present', passed: false, weight: 5, earned: 0 },
            ],
          },
        ],
      };

      const { executeFixPlans } = await import('./executor.js');

      await autoFixFindings(
        mockClient,
        { azure: azureReport },
        { dryRun: true },
      );

      expect(executeFixPlans).toHaveBeenCalled();
      const plans = vi.mocked(executeFixPlans).mock.calls[0][1];
      expect(plans.length).toBeGreaterThanOrEqual(1);
    });

    it('includes execution results in summary', async () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
            ],
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
            category: 'missing-azure-config',
            filesModified: ['azure.yaml'],
          },
        ],
        skipped: [],
        errors: [],
      });

      const result = await autoFixFindings(
        mockClient,
        { azure: azureReport },
        { dryRun: true },
      );

      expect(result.summary.totalCreated).toBe(1);
      expect(result.created).toHaveLength(1);
    });
  });
});
