import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { GitHubClient } from 'github-rest';

// Mock the github-rest module
vi.mock('github-rest', () => ({
  alerts: {
    listDependabotAlerts: vi.fn(),
    listCodeScanningAlerts: vi.fn(),
    listSecretScanningAlerts: vi.fn(),
    listRepositorySecurityAdvisories: vi.fn(),
  },
  security: {
    getBranchProtection: vi.fn(),
    getAutomatedSecurityFixes: vi.fn(),
  },
  repos: {
    getRepo: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Import after mocking
import { alerts, security, repos } from 'github-rest';
import {
  auditRepo,
  auditRepos,
  generateAuditSummary,
  type RepoSecurityAudit,
  type SecurityAuditReport,
} from './index.js';

// Mock client factory following established pattern
function createMockClient(): GitHubClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
    rawRequest: vi.fn(),
  } as unknown as GitHubClient;
}

/** Helper: set all mocks to return clean/enabled defaults */
function mockCleanRepo() {
  vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
  vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([] as any);
  vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([] as any);
  vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([] as any);
  vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
  vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
  vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);
}

describe('security-audit-repos', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  describe('auditRepo', () => {
    it('should audit a single repo with all data available', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([
        { security_advisory: { severity: 'critical' }, state: 'open' },
        { security_advisory: { severity: 'high' }, state: 'open' },
        { security_advisory: { severity: 'medium' }, state: 'open' },
      ] as any);
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([
        { state: 'open', rule: { severity: 'error' } },
      ] as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([
        { state: 'open' },
      ] as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([
        { severity: 'high' },
      ] as any);
      vi.mocked(security.getBranchProtection).mockResolvedValue({
        required_status_checks: { strict: true },
      } as any);
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({
        enabled: true,
      } as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');

      expect(result.owner).toBe('test-owner');
      expect(result.repo).toBe('test-repo');
      expect(result.dependabotAlerts.total).toBe(3);
      expect(result.dependabotAlerts.critical).toBe(1);
      expect(result.dependabotAlerts.high).toBe(1);
      expect(result.dependabotAlerts.medium).toBe(1);
      expect(result.codeScanningAlerts.total).toBe(1);
      expect(result.codeScanningAlerts.enabled).toBe(true);
      expect(result.secretScanningAlerts.total).toBe(1);
      expect(result.branchProtection.protected).toBe(true);
      expect(result.automatedSecurityFixes.enabled).toBe(true);
      expect(result.auditedAt).toBeTruthy();
      // Score: 100 - 20(crit) - 10(high) - 5(med) - 10(code) - 15(secret) = 40
      expect(result.score).toBe(40);
    });

    it('should handle 404 errors gracefully for disabled features', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listCodeScanningAlerts).mockRejectedValue(new Error('Not Found'));
      vi.mocked(alerts.listSecretScanningAlerts).mockRejectedValue(new Error('Not Found'));
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');

      expect(result.codeScanningAlerts.enabled).toBe(false);
      expect(result.codeScanningAlerts.total).toBe(0);
      expect(result.secretScanningAlerts.enabled).toBe(false);
      expect(result.secretScanningAlerts.total).toBe(0);
      // No penalty for disabled features — score stays high
      expect(result.score).toBe(100);
    });

    it('should calculate perfect score with no issues', async () => {
      mockCleanRepo();

      const result = await auditRepo(client, 'test-owner', 'test-repo');

      expect(result.score).toBe(100);
    });

    it('should handle repo metadata fetch failure gracefully', async () => {
      vi.mocked(repos.getRepo).mockRejectedValue(new Error('Not Found'));
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);

      // Should not throw — falls back to 'main' as default branch
      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.branchProtection.defaultBranch).toBe('main');
    });
  });

  describe('scoring algorithm', () => {
    it('should apply -20 penalty per critical dependabot alert', async () => {
      mockCleanRepo();
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([
        { security_advisory: { severity: 'critical' } },
        { security_advisory: { severity: 'critical' } },
      ] as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(60); // 100 - 2*20
    });

    it('should apply -10 penalty per high dependabot alert', async () => {
      mockCleanRepo();
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([
        { security_advisory: { severity: 'high' } },
        { security_advisory: { severity: 'high' } },
        { security_advisory: { severity: 'high' } },
      ] as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(70); // 100 - 3*10
    });

    it('should apply -5 penalty per medium dependabot alert', async () => {
      mockCleanRepo();
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([
        { security_advisory: { severity: 'medium' } },
      ] as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(95); // 100 - 5
    });

    it('should apply -15 penalty per secret scanning alert', async () => {
      mockCleanRepo();
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([
        { state: 'open' },
        { state: 'open' },
      ] as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(70); // 100 - 2*15
    });

    it('should apply -10 penalty per code scanning alert', async () => {
      mockCleanRepo();
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([
        { state: 'open' },
        { state: 'open' },
        { state: 'open' },
      ] as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(70); // 100 - 3*10
    });

    it('should apply -25 penalty if no branch protection', async () => {
      mockCleanRepo();
      vi.mocked(security.getBranchProtection).mockRejectedValue(new Error('Not Found'));

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.branchProtection.protected).toBe(false);
      expect(result.score).toBe(75); // 100 - 25
    });

    it('should apply -10 penalty if automated security fixes disabled', async () => {
      mockCleanRepo();
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: false } as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(90); // 100 - 10
    });

    it('should calculate cumulative penalties correctly', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([
        { security_advisory: { severity: 'critical' } }, // -20
        { security_advisory: { severity: 'high' } },     // -10
        { security_advisory: { severity: 'medium' } },   // -5
      ] as any);
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([
        { state: 'open' }, // -10
      ] as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([
        { state: 'open' }, // -15
      ] as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockRejectedValue(new Error('Not Found')); // -25
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: false } as any); // -10

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      // 100 - 20 - 10 - 5 - 10 - 15 - 25 - 10 = 5
      expect(result.score).toBe(5);
    });

    it('should enforce score floor at 0', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      const manyAlerts = Array(20).fill({ security_advisory: { severity: 'critical' } });
      vi.mocked(alerts.listDependabotAlerts).mockResolvedValue(manyAlerts as any);
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue(manyAlerts as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue(manyAlerts as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockRejectedValue(new Error('Not Found'));
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: false } as any);

      const result = await auditRepo(client, 'test-owner', 'test-repo');
      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('auditRepos', () => {
    it('should audit multiple repos and aggregate results', async () => {
      mockCleanRepo();

      const result = await auditRepos(client, ['org1/repo1', 'org1/repo2', 'org2/repo3']);

      expect(result.repos).toHaveLength(3);
      expect(result.summary.totalRepos).toBe(3);
      expect(result.summary.avgScore).toBe(100);
    });

    it('should calculate correct average score across repos', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      let callCount = 0;
      vi.mocked(alerts.listDependabotAlerts).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return [{ security_advisory: { severity: 'critical' } }] as any; // -20 → 80
        if (callCount === 2) return [] as any; // 100
        return [{ security_advisory: { severity: 'high' } }] as any; // -10 → 90
      });
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);

      const result = await auditRepos(client, ['org/repo1', 'org/repo2', 'org/repo3']);

      expect(result.summary.avgScore).toBe(90); // (80 + 100 + 90) / 3
    });

    it('should handle empty repo list gracefully', async () => {
      const result = await auditRepos(client, []);

      expect(result.repos).toHaveLength(0);
      expect(result.summary.totalRepos).toBe(0);
      expect(result.summary.avgScore).toBe(0);
    });

    it('should work correctly with single repo', async () => {
      mockCleanRepo();

      const result = await auditRepos(client, ['org/single-repo']);

      expect(result.repos).toHaveLength(1);
      expect(result.summary.totalRepos).toBe(1);
      expect(result.summary.avgScore).toBe(100);
    });

    it('should aggregate alert totals across all repos', async () => {
      vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
      let callCount = 0;
      vi.mocked(alerts.listDependabotAlerts).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return [{ security_advisory: { severity: 'critical' } }] as any;
        return [{ security_advisory: { severity: 'high' } }] as any;
      });
      vi.mocked(alerts.listCodeScanningAlerts).mockResolvedValue([{ state: 'open' }] as any);
      vi.mocked(alerts.listSecretScanningAlerts).mockResolvedValue([] as any);
      vi.mocked(alerts.listRepositorySecurityAdvisories).mockResolvedValue([] as any);
      vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
      vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);

      const result = await auditRepos(client, ['org/repo1', 'org/repo2']);

      expect(result.summary.totalDependabotAlerts).toBe(2);
      expect(result.summary.totalCodeScanningAlerts).toBe(2);
      expect(result.summary.totalSecretScanningAlerts).toBe(0);
    });

    it('should skip invalid repo names', async () => {
      mockCleanRepo();

      const result = await auditRepos(client, ['org/repo1', 'invalid-no-slash', 'org/repo2']);

      expect(result.repos).toHaveLength(2);
    });
  });

  describe('generateAuditSummary', () => {
    it('should return a string summary', () => {
      const report: SecurityAuditReport = {
        repos: [],
        summary: {
          totalRepos: 3,
          avgScore: 85,
          totalDependabotAlerts: 5,
          totalCodeScanningAlerts: 2,
          totalSecretScanningAlerts: 1,
          reposWithoutBranchProtection: 0,
          timestamp: new Date().toISOString(),
        },
      };

      const summary = generateAuditSummary(report);
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should include key metrics in summary', () => {
      const report: SecurityAuditReport = {
        repos: [],
        summary: {
          totalRepos: 10,
          avgScore: 75,
          totalDependabotAlerts: 15,
          totalCodeScanningAlerts: 8,
          totalSecretScanningAlerts: 3,
          reposWithoutBranchProtection: 2,
          timestamp: new Date().toISOString(),
        },
      };

      const summary = generateAuditSummary(report);
      expect(summary).toContain('10');
      expect(summary).toContain('75');
      expect(summary).toContain('15');
    });

    it('should handle empty report', () => {
      const report: SecurityAuditReport = {
        repos: [],
        summary: {
          totalRepos: 0,
          avgScore: 0,
          totalDependabotAlerts: 0,
          totalCodeScanningAlerts: 0,
          totalSecretScanningAlerts: 0,
          reposWithoutBranchProtection: 0,
          timestamp: new Date().toISOString(),
        },
      };

      const summary = generateAuditSummary(report);
      expect(typeof summary).toBe('string');
      expect(summary).toContain('0');
    });

    it('should sort repos by score lowest first', () => {
      const makeRepo = (name: string, score: number): RepoSecurityAudit => ({
        owner: 'o', repo: name, score, auditedAt: new Date().toISOString(),
        dependabotAlerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, alerts: [] },
        codeScanningAlerts: { total: 0, alerts: [], enabled: true },
        secretScanningAlerts: { total: 0, alerts: [], enabled: true },
        securityAdvisories: { total: 0, advisories: [] },
        branchProtection: { defaultBranch: 'main', protected: true },
        automatedSecurityFixes: { enabled: true },
      });
      const report: SecurityAuditReport = {
        repos: [makeRepo('high', 90), makeRepo('low', 20), makeRepo('mid', 60)],
        summary: {
          totalRepos: 3, avgScore: 56.67,
          totalDependabotAlerts: 0, totalCodeScanningAlerts: 0,
          totalSecretScanningAlerts: 0, reposWithoutBranchProtection: 0,
          timestamp: new Date().toISOString(),
        },
      };

      const summary = generateAuditSummary(report);
      const lowIdx = summary.indexOf('o/low');
      const midIdx = summary.indexOf('o/mid');
      const highIdx = summary.indexOf('o/high');
      expect(lowIdx).toBeLessThan(midIdx);
      expect(midIdx).toBeLessThan(highIdx);
    });
  });

  describe('type contracts', () => {
    it('should export RepoSecurityAudit type with required fields', async () => {
      mockCleanRepo();
      const result = await auditRepo(client, 'test', 'repo');
      const audit: RepoSecurityAudit = result;
      expect(audit.owner).toBeDefined();
      expect(audit.repo).toBeDefined();
      expect(audit.auditedAt).toBeDefined();
      expect(audit.dependabotAlerts).toBeDefined();
      expect(audit.codeScanningAlerts).toBeDefined();
      expect(audit.secretScanningAlerts).toBeDefined();
      expect(audit.securityAdvisories).toBeDefined();
      expect(audit.branchProtection).toBeDefined();
      expect(audit.automatedSecurityFixes).toBeDefined();
      expect(typeof audit.score).toBe('number');
    });

    it('should export SecurityAuditReport type with summary', async () => {
      mockCleanRepo();
      const result = await auditRepos(client, ['test/repo']);
      const report: SecurityAuditReport = result;
      expect(report.repos).toBeDefined();
      expect(report.summary.totalRepos).toBeDefined();
      expect(report.summary.avgScore).toBeDefined();
      expect(report.summary.timestamp).toBeDefined();
    });
  });
});
