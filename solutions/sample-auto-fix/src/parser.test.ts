/**
 * Tests for parser module.
 */

import { describe, it, expect } from 'vitest';
import { extractFixableFindings, extractAllFindings, filterByCategory, groupByRepo } from './parser.js';
import type {
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
} from './types.js';

describe('parser', () => {
  describe('extractFixableFindings', () => {
    it('extracts missing security files from security report (legacy format)', () => {
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

      const findings = extractFixableFindings(undefined, securityReport);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toEqual({
        owner: 'org',
        repo: 'repo1',
        category: 'missing-security-files',
        missingFiles: ['SECURITY.md', '.github/dependabot.yml'],
        source: 'security',
      });
    });

    it('skips forks in security report', () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'fork1',
            isFork: true,
            securityFiles: {
              securityMd: false,
              dependabotYml: false,
            },
          },
        ],
      };

      const findings = extractFixableFindings(undefined, securityReport);

      expect(findings).toHaveLength(0);
    });

    it('extracts auto-fixable files from azure BP checks array', () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'config', signal: 'env_example_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'config', signal: 'security_policy_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'security', signal: 'no_connection_strings_in_source', passed: true, weight: 8, earned: 8 },
            ],
          },
        ],
      };

      const findings = extractFixableFindings(undefined, undefined, undefined, azureReport);

      expect(findings).toHaveLength(2);

      const securityFinding = findings.find(f => f.category === 'missing-security-files');
      expect(securityFinding).toBeDefined();
      expect(securityFinding!.missingFiles).toContain('SECURITY.md');
      expect(securityFinding!.missingFiles).toContain('.env.example');

      const azureFinding = findings.find(f => f.category === 'missing-azure-config');
      expect(azureFinding).toBeDefined();
      expect(azureFinding!.missingFiles).toContain('azure.yaml');
    });

    it('returns empty array when all checks pass', () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: true, weight: 5, earned: 5 },
              { dimension: 'config', signal: 'env_example_present', passed: true, weight: 5, earned: 5 },
            ],
          },
        ],
      };

      const findings = extractFixableFindings(undefined, undefined, undefined, azureReport);

      expect(findings).toHaveLength(0);
    });
  });

  describe('extractAllFindings', () => {
    it('extracts security findings from actual security report shape', () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            score: 65,
            branchProtection: { protected: false },
            automatedSecurityFixes: { enabled: false },
            dependabotAlerts: { total: 3, critical: 1, high: 2, medium: 0, low: 0 },
          },
        ],
      };

      const findings = extractAllFindings(undefined, securityReport);

      expect(findings.length).toBeGreaterThanOrEqual(3);

      const bpFinding = findings.find(f => f.signal === 'no-branch-protection');
      expect(bpFinding).toBeDefined();
      expect(bpFinding!.fixability).toBe('manual-action');

      const secFixFinding = findings.find(f => f.signal === 'no-automated-security-fixes');
      expect(secFixFinding).toBeDefined();
      expect(secFixFinding!.fixability).toBe('manual-action');

      const criticalFinding = findings.find(f => f.signal === 'dependabot-critical');
      expect(criticalFinding).toBeDefined();
      expect(criticalFinding!.severity).toBe('critical');
    });

    it('extracts health check findings from checks array', () => {
      const healthReport: HealthCheckReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            score: 57,
            grade: 'C',
            checks: [
              { dimension: 'documentation', signal: 'readme_exists', passed: true, weight: 5, earned: 5 },
              { dimension: 'branch_protection', signal: 'branch_protected', passed: false, weight: 5, earned: 0 },
              { dimension: 'ci_cd', signal: 'has_workflows', passed: false, weight: 8, earned: 0 },
            ],
          },
        ],
      };

      const findings = extractAllFindings(undefined, undefined, healthReport);

      expect(findings).toHaveLength(2);
      expect(findings.every(f => f.source === 'health')).toBe(true);

      const bpFinding = findings.find(f => f.signal === 'branch_protected');
      expect(bpFinding).toBeDefined();
      expect(bpFinding!.fixability).toBe('manual-action');
    });

    it('classifies azure auto-fixable signals correctly', () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: [
              { dimension: 'config', signal: 'azd_yaml_present', passed: false, weight: 5, earned: 0 },
              { dimension: 'security', signal: 'no_connection_strings_in_source', passed: false, weight: 8, earned: 0, severity: 'critical' },
            ],
          },
        ],
      };

      const findings = extractAllFindings(undefined, undefined, undefined, azureReport);

      const azdFinding = findings.find(f => f.signal === 'azd_yaml_present');
      expect(azdFinding).toBeDefined();
      expect(azdFinding!.fixability).toBe('auto-fixable');

      const connStringFinding = findings.find(f => f.signal === 'no_connection_strings_in_source');
      expect(connStringFinding).toBeDefined();
      expect(connStringFinding!.fixability).toBe('manual-action');
      expect(connStringFinding!.severity).toBe('critical');
    });

    it('includes remediation planned items', () => {
      const remediationReport = {
        planned: [
          {
            repo: 'org/repo1',
            findingType: 'no-branch-protection',
            severity: 'medium',
            title: 'Enable branch protection',
          },
        ],
      };

      const findings = extractAllFindings(remediationReport);

      expect(findings).toHaveLength(1);
      expect(findings[0].source).toBe('remediation');
      expect(findings[0].fixability).toBe('informational');
    });
  });

  describe('filterByCategory', () => {
    it('filters findings by category', () => {
      const findings = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files' as const,
          missingFiles: ['SECURITY.md'],
          source: 'security' as const,
        },
        {
          owner: 'org',
          repo: 'repo2',
          category: 'missing-azure-config' as const,
          missingFiles: ['azure.yaml'],
          source: 'azure' as const,
        },
      ];

      const filtered = filterByCategory(findings, ['missing-security-files']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe('missing-security-files');
    });

    it('returns all findings when no categories specified', () => {
      const findings = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files' as const,
          missingFiles: ['SECURITY.md'],
          source: 'security' as const,
        },
      ];

      const filtered = filterByCategory(findings, []);

      expect(filtered).toHaveLength(1);
    });
  });

  describe('groupByRepo', () => {
    it('groups findings by repository', () => {
      const findings = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files' as const,
          missingFiles: ['SECURITY.md'],
          source: 'security' as const,
        },
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-azure-config' as const,
          missingFiles: ['azure.yaml'],
          source: 'azure' as const,
        },
        {
          owner: 'org',
          repo: 'repo2',
          category: 'missing-security-files' as const,
          missingFiles: ['.env.example'],
          source: 'health' as const,
        },
      ];

      const grouped = groupByRepo(findings);

      expect(grouped.size).toBe(2);
      expect(grouped.get('org/repo1')).toHaveLength(2);
      expect(grouped.get('org/repo2')).toHaveLength(1);
    });
  });
});
