/**
 * Test suite for create-remediation-issues.
 *
 * Written test-first — defines contracts for:
 *   1. Security finding → issue generation rules
 *   2. Health finding → issue generation rules
 *   3. Deduplication logic
 *   4. Dry-run mode
 *   5. Issue formatting
 *   6. Edge cases
 *
 * Mock strategy: vi.mock('github-rest') at module level (same as security-audit-repos).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { GitHubClient } from 'github-rest';

// Mock github-rest module at module level
vi.mock('github-rest', () => ({
  issues: {
    createIssue: vi.fn(),
    listIssues: vi.fn(),
    addLabelsToIssue: vi.fn(),
    createLabel: vi.fn(),
    listLabels: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Import after mocking
import { issues } from 'github-rest';
import {
  analyzeSecurityFindings,
  analyzeHealthFindings,
  deduplicateIssues,
  createRemediationIssues,
  formatIssueTitle,
  formatIssueBody,
  DEFAULT_SECURITY_SCORE_THRESHOLD,
  DEFAULT_HEALTH_GRADE_THRESHOLD,
  REMEDIATION_LABEL,
  SECURITY_LABEL,
  HEALTH_LABEL,
} from './index.js';

import type {
  SecurityAuditReport,
  RepoSecurityAudit,
  HealthCheckReport,
  RepoHealthCheck,
  RemediationIssue,
  RemediationResult,
  RemediationOptions,
  RemediationInput,
  CreatedIssue,
  SkippedIssue,
} from './index.js';

// ─── Mock Client Factory ─────────────────────────────────────────────────────

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

// ─── Test Data Factories ─────────────────────────────────────────────────────

function makeSecurityRepo(overrides: Partial<RepoSecurityAudit> = {}): RepoSecurityAudit {
  return {
    owner: 'Azure-Samples',
    repo: 'test-repo',
    auditedAt: new Date().toISOString(),
    score: 100,
    dependabotAlerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, alerts: [] },
    codeScanningAlerts: { total: 0, alerts: [], enabled: true },
    secretScanningAlerts: { total: 0, alerts: [], enabled: true },
    securityAdvisories: { total: 0, advisories: [] },
    branchProtection: { defaultBranch: 'main', protected: true },
    automatedSecurityFixes: { enabled: true },
    ...overrides,
  };
}

function makeSecurityReport(repos: RepoSecurityAudit[]): SecurityAuditReport {
  const totalRepos = repos.length;
  const avgScore = totalRepos > 0
    ? repos.reduce((sum, r) => sum + r.score, 0) / totalRepos
    : 0;
  return {
    repos,
    summary: {
      totalRepos,
      avgScore,
      totalDependabotAlerts: repos.reduce((sum, r) => sum + r.dependabotAlerts.total, 0),
      totalCodeScanningAlerts: repos.reduce((sum, r) => sum + r.codeScanningAlerts.total, 0),
      totalSecretScanningAlerts: repos.reduce((sum, r) => sum + r.secretScanningAlerts.total, 0),
      reposWithoutBranchProtection: repos.filter(r => !r.branchProtection.protected).length,
      timestamp: new Date().toISOString(),
    },
  };
}

function makeHealthRepo(overrides: Partial<RepoHealthCheck> = {}): RepoHealthCheck {
  return {
    owner: 'Azure-Samples',
    repo: 'test-repo',
    checkedAt: new Date().toISOString(),
    score: 95,
    grade: 'A',
    checks: [
      { dimension: 'documentation', signal: 'readme_exists', passed: true, weight: 5, earned: 5 },
      { dimension: 'hygiene', signal: 'description_set', passed: true, weight: 3, earned: 3 },
      { dimension: 'ci_cd', signal: 'has_workflows', passed: true, weight: 8, earned: 8 },
      { dimension: 'dependency_freshness', signal: 'low_critical_dependabot', passed: true, weight: 8, earned: 8 },
      { dimension: 'activity', signal: 'recent_commit', passed: true, weight: 8, earned: 8 },
      { dimension: 'branch_protection', signal: 'branch_protected', passed: true, weight: 5, earned: 5 },
      { dimension: 'azure', signal: 'has_azure_topic', passed: true, weight: 3, earned: 3 },
    ],
    dimensions: {
      documentation: { earned: 25, possible: 25, passRate: 1.0 },
      hygiene: { earned: 12, possible: 12, passRate: 1.0 },
      ci_cd: { earned: 20, possible: 20, passRate: 1.0 },
      dependency_freshness: { earned: 16, possible: 16, passRate: 1.0 },
      activity: { earned: 16, possible: 16, passRate: 1.0 },
      branch_protection: { earned: 5, possible: 5, passRate: 1.0 },
      azure: { earned: 6, possible: 6, passRate: 1.0 },
    },
    ...overrides,
  };
}

function makeHealthReport(repos: RepoHealthCheck[]): HealthCheckReport {
  const totalRepos = repos.length;
  const avgScore = totalRepos > 0
    ? repos.reduce((sum, r) => sum + r.score, 0) / totalRepos
    : 0;
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of repos) {
    gradeDistribution[r.grade] = (gradeDistribution[r.grade] ?? 0) + 1;
  }
  return {
    repos,
    summary: {
      totalRepos,
      avgScore,
      avgGrade: totalRepos > 0 ? repos[0].grade : 'F',
      gradeDistribution,
      worstDimension: 'documentation',
      timestamp: new Date().toISOString(),
    },
  };
}

// Mock GitHub issue response
function mockGitHubIssue(number: number, title: string, state = 'open') {
  return {
    id: number * 100,
    number,
    state,
    title,
    body: 'Issue body',
    labels: [],
    assignees: [],
    html_url: `https://github.com/Azure-Samples/test-repo/issues/${number}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. SECURITY FINDINGS → ISSUE GENERATION
// ═════════════════════════════════════════════════════════════════════════════

describe('analyzeSecurityFindings', () => {
  it('should create critical issue for repos with critical dependabot alerts', () => {
    const repo = makeSecurityRepo({
      score: 40,
      dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const criticalIssues = issues.filter(i => i.findingType === 'critical-dependabot');
    expect(criticalIssues.length).toBeGreaterThanOrEqual(1);
    expect(criticalIssues[0].severity).toBe('critical');
    expect(criticalIssues[0].source).toBe('security');
    expect(criticalIssues[0].owner).toBe('Azure-Samples');
    expect(criticalIssues[0].repo).toBe('test-repo');
  });

  it('should create high issue for repos with high dependabot alerts', () => {
    const repo = makeSecurityRepo({
      score: 60,
      dependabotAlerts: { total: 3, critical: 0, high: 3, medium: 0, low: 0, alerts: [] },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const highIssues = issues.filter(i => i.findingType === 'high-dependabot');
    expect(highIssues.length).toBeGreaterThanOrEqual(1);
    expect(highIssues[0].severity).toBe('high');
  });

  it('should create critical issue for repos with secret scanning alerts', () => {
    const repo = makeSecurityRepo({
      score: 55,
      secretScanningAlerts: { total: 3, alerts: [{}, {}, {}], enabled: true },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const secretIssues = issues.filter(i => i.findingType === 'secret-scanning');
    expect(secretIssues.length).toBeGreaterThanOrEqual(1);
    expect(secretIssues[0].severity).toBe('critical');
  });

  it('should create high issue for repos with code scanning alerts', () => {
    const repo = makeSecurityRepo({
      score: 50,
      codeScanningAlerts: { total: 5, alerts: [{}, {}, {}, {}, {}], enabled: true },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const codeIssues = issues.filter(i => i.findingType === 'code-scanning');
    expect(codeIssues.length).toBeGreaterThanOrEqual(1);
    expect(codeIssues[0].severity).toBe('high');
  });

  it('should create medium issue for repos without branch protection', () => {
    const repo = makeSecurityRepo({
      score: 65,
      branchProtection: { defaultBranch: 'main', protected: false },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const bpIssues = issues.filter(i => i.findingType === 'no-branch-protection');
    expect(bpIssues.length).toBeGreaterThanOrEqual(1);
    expect(bpIssues[0].severity).toBe('medium');
  });

  it('should create low issue for repos with automated security fixes disabled', () => {
    const repo = makeSecurityRepo({
      score: 80,
      automatedSecurityFixes: { enabled: false },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const autoFixIssues = issues.filter(i => i.findingType === 'no-automated-security-fixes');
    expect(autoFixIssues.length).toBeGreaterThanOrEqual(1);
    expect(autoFixIssues[0].severity).toBe('low');
  });

  it('should not create issues for repos above security score threshold', () => {
    const repo = makeSecurityRepo({ score: 100 });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should respect custom security score threshold', () => {
    const repo = makeSecurityRepo({
      score: 60,
      dependabotAlerts: { total: 1, critical: 0, high: 1, medium: 0, low: 0, alerts: [] },
    });
    const report = makeSecurityReport([repo]);

    // Default threshold (70) → should create issues
    const issuesDefault = analyzeSecurityFindings(report);
    expect(issuesDefault.length).toBeGreaterThan(0);

    // Custom low threshold (50) → should NOT create issues
    const issuesCustom = analyzeSecurityFindings(report, { securityScoreThreshold: 50 });
    expect(issuesCustom).toHaveLength(0);
  });

  it('should generate issues for multiple repos in one report', () => {
    const repo1 = makeSecurityRepo({
      owner: 'org', repo: 'repo1', score: 40,
      dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
    });
    const repo2 = makeSecurityRepo({
      owner: 'org', repo: 'repo2', score: 50,
      secretScanningAlerts: { total: 1, alerts: [{}], enabled: true },
    });
    const report = makeSecurityReport([repo1, repo2]);

    const issues = analyzeSecurityFindings(report);

    const repo1Issues = issues.filter(i => i.repo === 'repo1');
    const repo2Issues = issues.filter(i => i.repo === 'repo2');
    expect(repo1Issues.length).toBeGreaterThan(0);
    expect(repo2Issues.length).toBeGreaterThan(0);
  });

  it('should not generate duplicate finding types for same repo', () => {
    const repo = makeSecurityRepo({
      score: 30,
      dependabotAlerts: { total: 5, critical: 3, high: 2, medium: 0, low: 0, alerts: [] },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    // Should have at most one 'critical-dependabot' issue per repo
    const criticalIssues = issues.filter(
      i => i.findingType === 'critical-dependabot' && i.repo === 'test-repo'
    );
    expect(criticalIssues).toHaveLength(1);
  });

  it('should include alert counts in issue body for dependabot findings', () => {
    const repo = makeSecurityRepo({
      score: 40,
      dependabotAlerts: { total: 5, critical: 3, high: 2, medium: 0, low: 0, alerts: [] },
    });
    const report = makeSecurityReport([repo]);

    const issues = analyzeSecurityFindings(report);

    const criticalIssue = issues.find(i => i.findingType === 'critical-dependabot');
    expect(criticalIssue).toBeDefined();
    expect(criticalIssue!.body).toContain('3');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. HEALTH FINDINGS → ISSUE GENERATION
// ═════════════════════════════════════════════════════════════════════════════

describe('analyzeHealthFindings', () => {
  it('should create issue for repos with grade D', () => {
    const repo = makeHealthRepo({
      score: 35, grade: 'D',
      dimensions: {
        documentation: { earned: 5, possible: 25, passRate: 0.2 },
        ci_cd: { earned: 5, possible: 20, passRate: 0.25 },
      },
    });
    const report = makeHealthReport([repo]);

    const issues = analyzeHealthFindings(report);

    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].source).toBe('health');
    expect(issues[0].owner).toBe('Azure-Samples');
    expect(issues[0].repo).toBe('test-repo');
  });

  it('should create issue for repos with grade F', () => {
    const repo = makeHealthRepo({
      score: 15, grade: 'F',
      dimensions: {
        documentation: { earned: 2, possible: 25, passRate: 0.08 },
        ci_cd: { earned: 0, possible: 20, passRate: 0 },
      },
    });
    const report = makeHealthReport([repo]);

    const issues = analyzeHealthFindings(report);

    expect(issues.length).toBeGreaterThanOrEqual(1);
    const healthIssue = issues.find(i => i.findingType === 'low-health-grade');
    expect(healthIssue).toBeDefined();
    expect(healthIssue!.severity).toBe('high');
  });

  it('should not create issues for repos with grade A, B, or C', () => {
    const repoA = makeHealthRepo({ score: 95, grade: 'A' });
    const repoB = makeHealthRepo({ score: 80, grade: 'B', repo: 'b-repo' });
    const repoC = makeHealthRepo({ score: 55, grade: 'C', repo: 'c-repo' });
    const report = makeHealthReport([repoA, repoB, repoC]);

    const issues = analyzeHealthFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should create dimension-specific issues for failing dimensions', () => {
    const repo = makeHealthRepo({
      score: 30, grade: 'D',
      dimensions: {
        documentation: { earned: 3, possible: 25, passRate: 0.12 },
        hygiene: { earned: 10, possible: 12, passRate: 0.83 },
        ci_cd: { earned: 2, possible: 20, passRate: 0.1 },
        dependency_freshness: { earned: 16, possible: 16, passRate: 1.0 },
        activity: { earned: 4, possible: 16, passRate: 0.25 },
        branch_protection: { earned: 5, possible: 5, passRate: 1.0 },
        azure: { earned: 1, possible: 6, passRate: 0.17 },
      },
    });
    const report = makeHealthReport([repo]);

    const issues = analyzeHealthFindings(report);

    // Should create issues for dimensions with low pass rates
    const dimensionIssues = issues.filter(i => i.findingType.startsWith('failing-dimension'));
    expect(dimensionIssues.length).toBeGreaterThanOrEqual(1);

    // Should identify documentation and ci_cd as failing
    const dimensions = dimensionIssues.map(i => i.findingType);
    expect(dimensions.some(d => d.includes('documentation') || d.includes('ci_cd'))).toBe(true);
  });

  it('should respect custom health grade threshold', () => {
    const repo = makeHealthRepo({ score: 55, grade: 'C' });
    const report = makeHealthReport([repo]);

    // Default threshold ('D') → C is above, no issues
    const issuesDefault = analyzeHealthFindings(report);
    expect(issuesDefault).toHaveLength(0);

    // Custom threshold ('C') → C is at threshold, should create issues
    const issuesCustom = analyzeHealthFindings(report, { healthGradeThreshold: 'C' });
    expect(issuesCustom.length).toBeGreaterThan(0);
  });

  it('should include grade and score in issue body', () => {
    const repo = makeHealthRepo({ score: 30, grade: 'D' });
    const report = makeHealthReport([repo]);

    const issues = analyzeHealthFindings(report);

    const healthIssue = issues.find(i => i.findingType === 'low-health-grade');
    expect(healthIssue).toBeDefined();
    expect(healthIssue!.body).toContain('30');
    expect(healthIssue!.body).toContain('D');
  });

  it('should generate issues for multiple unhealthy repos', () => {
    const repo1 = makeHealthRepo({
      owner: 'org', repo: 'bad-repo1', score: 20, grade: 'F',
    });
    const repo2 = makeHealthRepo({
      owner: 'org', repo: 'bad-repo2', score: 35, grade: 'D',
    });
    const report = makeHealthReport([repo1, repo2]);

    const issues = analyzeHealthFindings(report);

    const repo1Issues = issues.filter(i => i.repo === 'bad-repo1');
    const repo2Issues = issues.filter(i => i.repo === 'bad-repo2');
    expect(repo1Issues.length).toBeGreaterThan(0);
    expect(repo2Issues.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. DEDUPLICATION
// ═════════════════════════════════════════════════════════════════════════════

describe('deduplicateIssues', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should skip issue when open issue with matching title exists', async () => {
    const planned: RemediationIssue[] = [{
      owner: 'org', repo: 'repo1',
      title: '[Security] org/repo1: Critical Dependabot vulnerabilities',
      body: 'Details...', labels: ['security'],
      source: 'security', findingType: 'critical-dependabot', severity: 'critical',
    }];

    vi.mocked(issues.listIssues).mockResolvedValue([
      mockGitHubIssue(42, '[Security] org/repo1: Critical Dependabot vulnerabilities', 'open'),
    ] as any);

    const { toCreate, toSkip } = await deduplicateIssues(client, planned);

    expect(toCreate).toHaveLength(0);
    expect(toSkip).toHaveLength(1);
    expect(toSkip[0].reason).toContain('duplicate');
    expect(toSkip[0].existingIssueNumber).toBe(42);
  });

  it('should create issue when existing matching issue is closed', async () => {
    const planned: RemediationIssue[] = [{
      owner: 'org', repo: 'repo1',
      title: '[Security] org/repo1: Critical Dependabot vulnerabilities',
      body: 'Details...', labels: ['security'],
      source: 'security', findingType: 'critical-dependabot', severity: 'critical',
    }];

    // Only closed issue exists — should NOT be treated as duplicate
    vi.mocked(issues.listIssues).mockResolvedValue([
      mockGitHubIssue(42, '[Security] org/repo1: Critical Dependabot vulnerabilities', 'closed'),
    ] as any);

    const { toCreate, toSkip } = await deduplicateIssues(client, planned);

    expect(toCreate).toHaveLength(1);
    expect(toSkip).toHaveLength(0);
  });

  it('should create issue when no matching issue exists', async () => {
    const planned: RemediationIssue[] = [{
      owner: 'org', repo: 'repo1',
      title: '[Security] org/repo1: Secret scanning alerts',
      body: 'Details...', labels: ['security'],
      source: 'security', findingType: 'secret-scanning', severity: 'critical',
    }];

    vi.mocked(issues.listIssues).mockResolvedValue([
      mockGitHubIssue(10, '[Health] org/repo1: Low health grade', 'open'),
    ] as any);

    const { toCreate, toSkip } = await deduplicateIssues(client, planned);

    expect(toCreate).toHaveLength(1);
    expect(toSkip).toHaveLength(0);
  });

  it('should handle mix of duplicates and new issues', async () => {
    const planned: RemediationIssue[] = [
      {
        owner: 'org', repo: 'repo1',
        title: '[Security] org/repo1: Critical Dependabot vulnerabilities',
        body: 'Details...', labels: ['security'],
        source: 'security', findingType: 'critical-dependabot', severity: 'critical',
      },
      {
        owner: 'org', repo: 'repo1',
        title: '[Security] org/repo1: Secret scanning alerts',
        body: 'Details...', labels: ['security'],
        source: 'security', findingType: 'secret-scanning', severity: 'critical',
      },
    ];

    // Only the dependabot issue exists already
    vi.mocked(issues.listIssues).mockResolvedValue([
      mockGitHubIssue(42, '[Security] org/repo1: Critical Dependabot vulnerabilities', 'open'),
    ] as any);

    const { toCreate, toSkip } = await deduplicateIssues(client, planned);

    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].findingType).toBe('secret-scanning');
    expect(toSkip).toHaveLength(1);
    expect(toSkip[0].findingType).toBe('critical-dependabot');
  });

  it('should call listIssues with correct owner and repo', async () => {
    const planned: RemediationIssue[] = [{
      owner: 'my-org', repo: 'my-repo',
      title: '[Security] my-org/my-repo: Test',
      body: 'Test', labels: [],
      source: 'security', findingType: 'test', severity: 'high',
    }];

    vi.mocked(issues.listIssues).mockResolvedValue([] as any);

    await deduplicateIssues(client, planned);

    expect(issues.listIssues).toHaveBeenCalledWith(
      client, 'my-org', 'my-repo',
      expect.anything(), // state filter
      expect.anything(), // labels filter
      expect.anything(), // per_page
      expect.anything(), // page
    );
  });

  it('should handle listIssues API error gracefully', async () => {
    const planned: RemediationIssue[] = [{
      owner: 'org', repo: 'repo1',
      title: '[Security] org/repo1: Test',
      body: 'Test', labels: [],
      source: 'security', findingType: 'test', severity: 'high',
    }];

    vi.mocked(issues.listIssues).mockRejectedValue(new Error('API rate limit'));

    // Should not throw — on error, treat as no duplicates (create anyway)
    const { toCreate, toSkip } = await deduplicateIssues(client, planned);

    expect(toCreate).toHaveLength(1);
    expect(toSkip).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DRY-RUN MODE
// ═════════════════════════════════════════════════════════════════════════════

describe('dry-run mode', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should return planned issues without calling createIssue in dry-run', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 30,
        dependabotAlerts: { total: 3, critical: 3, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(result.planned.length).toBeGreaterThan(0);
    expect(result.created).toHaveLength(0);
    expect(issues.createIssue).not.toHaveBeenCalled();
  });

  it('should report what WOULD be created in dry-run summary', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
        branchProtection: { defaultBranch: 'main', protected: false },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: true },
    );

    expect(result.summary.totalPlanned).toBeGreaterThan(0);
    expect(result.summary.totalCreated).toBe(0);
  });

  it('should not call any github-rest issue functions in dry-run', async () => {
    const healthReport = makeHealthReport([
      makeHealthRepo({ score: 20, grade: 'F' }),
    ]);

    await createRemediationIssues(
      client,
      { healthReport },
      { dryRun: true },
    );

    expect(issues.createIssue).not.toHaveBeenCalled();
    expect(issues.addLabelsToIssue).not.toHaveBeenCalled();
    expect(issues.createLabel).not.toHaveBeenCalled();
    // listIssues MAY be called for dedup even in dry-run, that's acceptable
  });

  it('should still perform deduplication analysis in dry-run', async () => {
    vi.mocked(issues.listIssues).mockResolvedValue([
      mockGitHubIssue(1, '[Security] Azure-Samples/test-repo: Critical Dependabot vulnerabilities', 'open'),
    ] as any);

    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 30,
        dependabotAlerts: { total: 3, critical: 3, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    // Should still report skipped (duplicated) issues
    expect(result.skipped.length + result.planned.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. ISSUE FORMATTING
// ═════════════════════════════════════════════════════════════════════════════

describe('formatIssueTitle', () => {
  it('should include source tag in brackets', () => {
    const title = formatIssueTitle('security', 'org', 'repo', 'critical-dependabot');

    expect(title).toMatch(/^\[Security\]/i);
  });

  it('should include owner/repo in title', () => {
    const title = formatIssueTitle('security', 'Azure-Samples', 'my-app', 'critical-dependabot');

    expect(title).toContain('Azure-Samples/my-app');
  });

  it('should include finding type description', () => {
    const title = formatIssueTitle('security', 'org', 'repo', 'secret-scanning');

    expect(title.toLowerCase()).toContain('secret');
  });

  it('should include optional detail in title', () => {
    const title = formatIssueTitle('health', 'org', 'repo', 'low-health-grade', '3 critical');

    expect(title).toContain('3 critical');
  });

  it('should use Health tag for health source', () => {
    const title = formatIssueTitle('health', 'org', 'repo', 'low-health-grade');

    expect(title).toMatch(/^\[Health\]/i);
  });
});

describe('formatIssueBody', () => {
  it('should include repo name in body', () => {
    const issue: RemediationIssue = {
      owner: 'Azure-Samples', repo: 'my-app',
      title: 'Test', body: '',
      labels: [], source: 'security',
      findingType: 'critical-dependabot', severity: 'critical',
    };

    const body = formatIssueBody(issue, { alertCount: 5, score: 40 });

    expect(body).toContain('Azure-Samples/my-app');
  });

  it('should include context data when provided', () => {
    const issue: RemediationIssue = {
      owner: 'org', repo: 'repo',
      title: 'Test', body: '',
      labels: [], source: 'security',
      findingType: 'critical-dependabot', severity: 'critical',
    };

    const body = formatIssueBody(issue, { alertCount: 5, score: 40 });

    expect(body).toContain('5');
    expect(body).toContain('40');
  });

  it('should include severity in body', () => {
    const issue: RemediationIssue = {
      owner: 'org', repo: 'repo',
      title: 'Test', body: '',
      labels: [], source: 'security',
      findingType: 'critical-dependabot', severity: 'critical',
    };

    const body = formatIssueBody(issue);

    expect(body.toLowerCase()).toContain('critical');
  });

  it('should produce valid markdown', () => {
    const issue: RemediationIssue = {
      owner: 'org', repo: 'repo',
      title: 'Test', body: '',
      labels: [], source: 'health',
      findingType: 'low-health-grade', severity: 'high',
    };

    const body = formatIssueBody(issue, { score: 30, grade: 'D' });

    // Should contain markdown heading or formatting
    expect(body).toMatch(/#|##|\*\*|\-/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. ORCHESTRATOR (createRemediationIssues)
// ═════════════════════════════════════════════════════════════════════════════

describe('createRemediationIssues', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();

    // Default: no existing issues, successful creation
    vi.mocked(issues.listIssues).mockResolvedValue([] as any);
    vi.mocked(issues.createIssue).mockImplementation(
      async (_client, owner, repo, title) => mockGitHubIssue(
        Math.floor(Math.random() * 1000), title
      ) as any,
    );
    vi.mocked(issues.addLabelsToIssue).mockResolvedValue([] as any);
    vi.mocked(issues.createLabel).mockResolvedValue({
      id: 1, name: 'test', color: 'red', default: false,
    } as any);
  });

  it('should create issues for security findings when not dry-run', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 30,
        dependabotAlerts: { total: 3, critical: 3, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false },
    );

    expect(result.dryRun).toBe(false);
    expect(result.created.length).toBeGreaterThan(0);
    expect(issues.createIssue).toHaveBeenCalled();
  });

  it('should create issues for health findings when not dry-run', async () => {
    const healthReport = makeHealthReport([
      makeHealthRepo({ score: 20, grade: 'F' }),
    ]);

    const result = await createRemediationIssues(
      client,
      { healthReport },
      { dryRun: false },
    );

    expect(result.created.length).toBeGreaterThan(0);
    expect(issues.createIssue).toHaveBeenCalled();
  });

  it('should process both security and health reports together', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        owner: 'org', repo: 'repo1', score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);
    const healthReport = makeHealthReport([
      makeHealthRepo({ owner: 'org', repo: 'repo1', score: 20, grade: 'F' }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport, healthReport },
      { dryRun: false },
    );

    const securityIssues = result.created.filter(i => i.source === 'security');
    const healthIssues = result.created.filter(i => i.source === 'health');
    expect(securityIssues.length).toBeGreaterThan(0);
    expect(healthIssues.length).toBeGreaterThan(0);
  });

  it('should apply remediation label to all created issues', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false },
    );

    for (const created of result.created) {
      expect(created.labels).toContain(REMEDIATION_LABEL);
    }
  });

  it('should apply source-specific labels', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false },
    );

    const securityIssues = result.created.filter(i => i.source === 'security');
    for (const created of securityIssues) {
      expect(created.labels).toContain(SECURITY_LABEL);
    }
  });

  it('should include extra labels when provided', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false, extraLabels: ['priority:p1', 'team:devrel'] },
    );

    for (const created of result.created) {
      expect(created.labels).toContain('priority:p1');
      expect(created.labels).toContain('team:devrel');
    }
  });

  it('should return issue number and URL for created issues', async () => {
    vi.mocked(issues.createIssue).mockResolvedValue(
      mockGitHubIssue(99, 'Test issue') as any,
    );

    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false },
    );

    expect(result.created.length).toBeGreaterThan(0);
    for (const created of result.created) {
      expect(typeof created.issueNumber).toBe('number');
      expect(created.issueUrl).toContain('github.com');
    }
  });

  it('should populate summary statistics', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: false },
    );

    expect(typeof result.summary.totalPlanned).toBe('number');
    expect(typeof result.summary.totalCreated).toBe('number');
    expect(typeof result.summary.totalSkipped).toBe('number');
    expect(result.summary.timestamp).toBeTruthy();
    expect(result.summary.totalCreated).toBe(result.created.length);
    expect(result.summary.totalSkipped).toBe(result.skipped.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
    vi.mocked(issues.listIssues).mockResolvedValue([] as any);
    vi.mocked(issues.createIssue).mockImplementation(
      async (_client, owner, repo, title) => mockGitHubIssue(
        Math.floor(Math.random() * 1000), title
      ) as any,
    );
  });

  it('should handle empty security report (no repos)', () => {
    const report = makeSecurityReport([]);

    const issues = analyzeSecurityFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should handle empty health report (no repos)', () => {
    const report = makeHealthReport([]);

    const issues = analyzeHealthFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should handle report with all healthy repos', () => {
    const report = makeSecurityReport([
      makeSecurityRepo({ score: 100 }),
      makeSecurityRepo({ repo: 'repo2', score: 95 }),
    ]);

    const issues = analyzeSecurityFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should handle report with all healthy grades', () => {
    const report = makeHealthReport([
      makeHealthRepo({ score: 95, grade: 'A' }),
      makeHealthRepo({ repo: 'repo2', score: 80, grade: 'B' }),
    ]);

    const issues = analyzeHealthFindings(report);

    expect(issues).toHaveLength(0);
  });

  it('should handle repo with both security and health issues', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        owner: 'org', repo: 'troubled-repo', score: 20,
        dependabotAlerts: { total: 5, critical: 3, high: 2, medium: 0, low: 0, alerts: [] },
        secretScanningAlerts: { total: 2, alerts: [{}, {}], enabled: true },
        branchProtection: { defaultBranch: 'main', protected: false },
      }),
    ]);
    const healthReport = makeHealthReport([
      makeHealthRepo({
        owner: 'org', repo: 'troubled-repo', score: 15, grade: 'F',
        dimensions: {
          documentation: { earned: 2, possible: 25, passRate: 0.08 },
          ci_cd: { earned: 0, possible: 20, passRate: 0 },
        },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport, healthReport },
      { dryRun: true },
    );

    // Should have issues from both sources for the same repo
    const securityPlanned = result.planned.filter(i => i.source === 'security');
    const healthPlanned = result.planned.filter(i => i.source === 'health');
    expect(securityPlanned.length).toBeGreaterThan(0);
    expect(healthPlanned.length).toBeGreaterThan(0);
    // All should reference the same repo
    for (const issue of result.planned) {
      expect(issue.repo).toBe('troubled-repo');
    }
  });

  it('should handle input with only security report (no health)', async () => {
    const securityReport = makeSecurityReport([
      makeSecurityRepo({
        score: 40,
        dependabotAlerts: { total: 2, critical: 2, high: 0, medium: 0, low: 0, alerts: [] },
      }),
    ]);

    const result = await createRemediationIssues(
      client,
      { securityReport },
      { dryRun: true },
    );

    expect(result.planned.length).toBeGreaterThan(0);
    expect(result.planned.every(i => i.source === 'security')).toBe(true);
  });

  it('should handle input with only health report (no security)', async () => {
    const healthReport = makeHealthReport([
      makeHealthRepo({ score: 20, grade: 'F' }),
    ]);

    const result = await createRemediationIssues(
      client,
      { healthReport },
      { dryRun: true },
    );

    expect(result.planned.length).toBeGreaterThan(0);
    expect(result.planned.every(i => i.source === 'health')).toBe(true);
  });

  it('should handle input with no reports at all', async () => {
    const result = await createRemediationIssues(
      client,
      {},
      { dryRun: true },
    );

    expect(result.planned).toHaveLength(0);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.summary.totalPlanned).toBe(0);
  });

  it('should handle missing optional fields in security report repos', () => {
    const repo: RepoSecurityAudit = {
      owner: 'org', repo: 'repo',
      auditedAt: new Date().toISOString(),
      score: 50,
      dependabotAlerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, alerts: [] },
      codeScanningAlerts: { total: 0, alerts: [], enabled: false },
      secretScanningAlerts: { total: 0, alerts: [], enabled: false },
      securityAdvisories: { total: 0, advisories: [] },
      branchProtection: { defaultBranch: 'main', protected: false },
      automatedSecurityFixes: { enabled: false },
    };
    const report = makeSecurityReport([repo]);

    // Should not throw even with zero alerts but low score
    const foundIssues = analyzeSecurityFindings(report);
    expect(Array.isArray(foundIssues)).toBe(true);
  });

  it('should handle missing dimensions in health report repos', () => {
    const repo = makeHealthRepo({
      score: 30, grade: 'D',
      dimensions: {}, // empty dimensions
      checks: [],
    });
    const report = makeHealthReport([repo]);

    // Should still create the overall health grade issue
    const foundIssues = analyzeHealthFindings(report);
    expect(foundIssues.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. CONSTANTS & TYPE CONTRACTS
// ═════════════════════════════════════════════════════════════════════════════

describe('constants and exports', () => {
  it('should export DEFAULT_SECURITY_SCORE_THRESHOLD as 70', () => {
    expect(DEFAULT_SECURITY_SCORE_THRESHOLD).toBe(70);
  });

  it('should export DEFAULT_HEALTH_GRADE_THRESHOLD as D', () => {
    expect(DEFAULT_HEALTH_GRADE_THRESHOLD).toBe('D');
  });

  it('should export REMEDIATION_LABEL', () => {
    expect(typeof REMEDIATION_LABEL).toBe('string');
    expect(REMEDIATION_LABEL.length).toBeGreaterThan(0);
  });

  it('should export SECURITY_LABEL', () => {
    expect(typeof SECURITY_LABEL).toBe('string');
  });

  it('should export HEALTH_LABEL', () => {
    expect(typeof HEALTH_LABEL).toBe('string');
  });

  it('should export all analysis functions', () => {
    expect(typeof analyzeSecurityFindings).toBe('function');
    expect(typeof analyzeHealthFindings).toBe('function');
    expect(typeof deduplicateIssues).toBe('function');
    expect(typeof createRemediationIssues).toBe('function');
    expect(typeof formatIssueTitle).toBe('function');
    expect(typeof formatIssueBody).toBe('function');
  });
});
