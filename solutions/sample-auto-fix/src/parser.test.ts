/**
 * Tests for parser module.
 */

import { describe, it, expect } from 'vitest';
import { extractFixableFindings, filterByCategory, groupByRepo } from './parser.js';
import type {
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
} from './types.js';

describe('parser', () => {
  describe('extractFixableFindings', () => {
    it('extracts missing security files from security report', () => {
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

    it('extracts missing files from health report', () => {
      const healthReport: HealthCheckReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: {
              envExample: { pass: false },
              securityMd: { pass: false },
            },
          },
        ],
      };

      const findings = extractFixableFindings(undefined, undefined, healthReport);

      expect(findings).toHaveLength(1);
      expect(findings[0].missingFiles).toContain('.env.example');
      expect(findings[0].missingFiles).toContain('SECURITY.md');
    });

    it('merges findings from multiple sources for same repo', () => {
      const securityReport: SecurityAuditReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            securityFiles: {
              securityMd: false,
              dependabotYml: true,
            },
          },
        ],
      };

      const healthReport: HealthCheckReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: {
              envExample: { pass: false },
            },
          },
        ],
      };

      const findings = extractFixableFindings(undefined, securityReport, healthReport);

      expect(findings).toHaveLength(1);
      expect(findings[0].missingFiles).toContain('SECURITY.md');
      expect(findings[0].missingFiles).toContain('.env.example');
      expect(findings[0].missingFiles).not.toContain('.github/dependabot.yml');
    });

    it('extracts Azure config gaps', () => {
      const azureReport: AzureBestPracticesReport = {
        repos: [
          {
            owner: 'org',
            repo: 'repo1',
            checks: {
              azdYaml: { pass: false },
            },
          },
        ],
      };

      const findings = extractFixableFindings(undefined, undefined, undefined, azureReport);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toEqual({
        owner: 'org',
        repo: 'repo1',
        category: 'missing-azure-config',
        missingFiles: ['azure.yaml'],
        source: 'azure',
      });
    });

    it('returns empty array when no fixable findings', () => {
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

      const findings = extractFixableFindings(undefined, securityReport);

      expect(findings).toHaveLength(0);
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
