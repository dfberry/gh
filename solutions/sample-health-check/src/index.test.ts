import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { GitHubClient } from 'github-rest';

// Mock the github-rest module at module level
vi.mock('github-rest', () => ({
  repos: {
    getRepo: vi.fn(),
    getRepoReadme: vi.fn(),
    getCommunityProfile: vi.fn(),
    getDefaultBranch: vi.fn(),
    getTopics: vi.fn(),
    listReleases: vi.fn(),
    fetchRepoMetadata: vi.fn(),
  },
  actions: {
    listRepoWorkflows: vi.fn(),
    getLatestWorkflowRun: vi.fn(),
    listWorkflowRuns: vi.fn(),
  },
  alerts: {
    listDependabotAlerts: vi.fn(),
  },
  security: {
    getBranchProtection: vi.fn(),
    getAutomatedSecurityFixes: vi.fn(),
  },
  contents: {
    getRootContents: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Import after mocking
import { repos, actions, alerts, security, contents } from 'github-rest';
import {
  checkRepoHealth,
  checkReposHealth,
  generateHealthSummary,
  type RepoHealthCheck,
  type HealthCheckReport,
} from './index.js';

// Mock client factory
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

/** Helper: set all mocks to return healthy defaults */
function mockHealthyRepo() {
  vi.mocked(repos.getRepo).mockResolvedValue({
    description: 'Azure SDK samples for JavaScript',
    topics: ['azure', 'javascript', 'sdk'],
    archived: false,
    default_branch: 'main',
    open_issues_count: 5,
    pushed_at: new Date().toISOString(),
  } as any);

  vi.mocked(repos.getRepoReadme).mockResolvedValue(
    '# Project\n\n## Prerequisites\n\nNode.js 22+\n\n## Setup\n\nRun npm install\n\n## Running\n\nRun npm start\n\n' +
    'A'.repeat(500)
  );

  vi.mocked(repos.getCommunityProfile).mockResolvedValue({
    health_percentage: 100,
    files: {
      code_of_conduct: { name: 'CODE_OF_CONDUCT.md' },
      contributing: { name: 'CONTRIBUTING.md' },
      license: { name: 'LICENSE' },
      readme: { name: 'README.md' },
    },
  } as any);

  vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');

  vi.mocked(repos.getTopics).mockResolvedValue({
    names: ['azure', 'javascript', 'sdk'],
  } as any);

  vi.mocked(repos.listReleases).mockResolvedValue([
    { tag_name: 'v1.0.0' },
  ] as any);

  vi.mocked(repos.fetchRepoMetadata).mockResolvedValue({
    lastCommitDate: new Date().toISOString(),
  } as any);

  vi.mocked(contents.getRootContents).mockResolvedValue([
    { name: '.gitignore', type: 'file' },
    { name: 'LICENSE', type: 'file' },
    { name: 'README.md', type: 'file' },
    { name: 'CONTRIBUTING.md', type: 'file' },
    { name: 'CODE_OF_CONDUCT.md', type: 'file' },
  ] as any);

  vi.mocked(actions.listRepoWorkflows).mockResolvedValue({
    total_count: 2,
    workflows: [
      { id: 1, name: 'CI' },
      { id: 2, name: 'Deploy' },
    ],
  } as any);

  vi.mocked(actions.getLatestWorkflowRun).mockResolvedValue({
    conclusion: 'success',
    status: 'completed',
  } as any);

  vi.mocked(actions.listWorkflowRuns).mockResolvedValue({
    workflow_runs: [{ conclusion: 'success' }],
  } as any);

  vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([] as any);

  vi.mocked(security.getBranchProtection).mockResolvedValue({
    required_status_checks: { strict: true },
  } as any);

  vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({
    enabled: true,
  } as any);
}

// ─── checkRepoHealth ─────────────────────────────────────────────────────────

describe('checkRepoHealth', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should return a complete health check with all data available', async () => {
    mockHealthyRepo();

    const result = await checkRepoHealth(client, 'Azure-Samples', 'my-app');

    expect(result.owner).toBe('Azure-Samples');
    expect(result.repo).toBe('my-app');
    expect(typeof result.score).toBe('number');
    expect(typeof result.grade).toBe('string');
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.dimensions).toBeDefined();
    expect(result.checkedAt).toBeTruthy();
  });

  it('should return high score when all signals are healthy', async () => {
    mockHealthyRepo();

    const result = await checkRepoHealth(client, 'Azure-Samples', 'healthy-repo');

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe('A');
  });

  it('should handle 404 gracefully via Promise.allSettled', async () => {
    // Some endpoints succeed, others 404
    vi.mocked(repos.getRepo).mockResolvedValue({
      description: 'Test repo',
      topics: [],
      archived: false,
      default_branch: 'main',
      open_issues_count: 0,
      pushed_at: new Date().toISOString(),
    } as any);

    vi.mocked(repos.getRepoReadme).mockRejectedValue(new Error('Not Found'));
    vi.mocked(repos.getCommunityProfile).mockRejectedValue(new Error('Not Found'));
    vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(repos.getTopics).mockResolvedValue({ names: [] } as any);
    vi.mocked(repos.listReleases).mockResolvedValue([] as any);
    vi.mocked(repos.fetchRepoMetadata).mockRejectedValue(new Error('Not Found'));
    vi.mocked(contents.getRootContents).mockRejectedValue(new Error('Not Found'));
    vi.mocked(actions.listRepoWorkflows).mockResolvedValue({ total_count: 0, workflows: [] } as any);
    vi.mocked(actions.getLatestWorkflowRun).mockResolvedValue(null as any);
    vi.mocked(actions.listWorkflowRuns).mockResolvedValue({ workflow_runs: [] } as any);
    vi.mocked(alerts.listDependabotAlerts).mockRejectedValue(new Error('Not Found'));
    vi.mocked(security.getBranchProtection).mockRejectedValue(new Error('Not Found'));
    vi.mocked(security.getAutomatedSecurityFixes).mockRejectedValue(new Error('Not Found'));

    // Should NOT throw — continues with available data
    const result = await checkRepoHealth(client, 'test-owner', 'test-repo');
    expect(result.owner).toBe('test-owner');
    expect(result.repo).toBe('test-repo');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should handle network error without crashing', async () => {
    vi.mocked(repos.getRepo).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.getRepoReadme).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.getCommunityProfile).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.getDefaultBranch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.getTopics).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.listReleases).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(repos.fetchRepoMetadata).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(contents.getRootContents).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(actions.listRepoWorkflows).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(actions.getLatestWorkflowRun).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(actions.listWorkflowRuns).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(alerts.listDependabotAlerts).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(security.getBranchProtection).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(security.getAutomatedSecurityFixes).mockRejectedValue(new Error('ECONNREFUSED'));

    // With allSettled, should not throw but produce a low-scoring result
    const result = await checkRepoHealth(client, 'test', 'repo');
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });

  it('should return correct structure with all required fields', async () => {
    mockHealthyRepo();

    const result = await checkRepoHealth(client, 'owner', 'repo');

    // Type contract: RepoHealthCheck
    const check: RepoHealthCheck = result;
    expect(check).toHaveProperty('owner');
    expect(check).toHaveProperty('repo');
    expect(check).toHaveProperty('checkedAt');
    expect(check).toHaveProperty('score');
    expect(check).toHaveProperty('grade');
    expect(check).toHaveProperty('checks');
    expect(check).toHaveProperty('dimensions');

    // Validate checks contain expected fields
    for (const c of check.checks) {
      expect(c).toHaveProperty('dimension');
      expect(c).toHaveProperty('signal');
      expect(c).toHaveProperty('passed');
      expect(c).toHaveProperty('weight');
      expect(c).toHaveProperty('earned');
    }

    // Validate dimensions contain expected fields
    for (const dim of Object.values(check.dimensions)) {
      expect(dim).toHaveProperty('earned');
      expect(dim).toHaveProperty('possible');
      expect(dim).toHaveProperty('passRate');
    }
  });

  it('should have all 7 dimensions represented in checks', async () => {
    mockHealthyRepo();

    const result = await checkRepoHealth(client, 'owner', 'repo');
    const dimensions = new Set(result.checks.map((c: any) => c.dimension));

    expect(dimensions.has('documentation')).toBe(true);
    expect(dimensions.has('hygiene')).toBe(true);
    expect(dimensions.has('ci_cd')).toBe(true);
    expect(dimensions.has('dependency_freshness')).toBe(true);
    expect(dimensions.has('activity')).toBe(true);
    expect(dimensions.has('branch_protection')).toBe(true);
    expect(dimensions.has('azure')).toBe(true);
  });

  it('should produce exactly 25 check results (one per signal)', async () => {
    mockHealthyRepo();

    const result = await checkRepoHealth(client, 'owner', 'repo');
    expect(result.checks).toHaveLength(25);
  });
});

// ─── checkReposHealth ────────────────────────────────────────────────────────

describe('checkReposHealth', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should aggregate results for multiple repos', async () => {
    mockHealthyRepo();

    const result = await checkReposHealth(client, ['org/repo1', 'org/repo2']);

    expect(result.repos).toHaveLength(2);
    expect(result.summary.totalRepos).toBe(2);
    expect(typeof result.summary.avgScore).toBe('number');
    expect(typeof result.summary.avgGrade).toBe('string');
    expect(result.summary.gradeDistribution).toBeDefined();
    expect(result.summary.timestamp).toBeTruthy();
  });

  it('should handle empty repo list gracefully', async () => {
    const result = await checkReposHealth(client, []);

    expect(result.repos).toHaveLength(0);
    expect(result.summary.totalRepos).toBe(0);
    expect(result.summary.avgScore).toBe(0);
  });

  it('should handle mixed success and failure repos', async () => {
    // First repo is healthy
    let callCount = 0;
    vi.mocked(repos.getRepo).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          description: 'Azure app',
          topics: ['azure', 'javascript'],
          archived: false,
          default_branch: 'main',
          open_issues_count: 5,
          pushed_at: new Date().toISOString(),
        } as any;
      }
      // Second repo fails entirely
      throw new Error('Not Found');
    });

    vi.mocked(repos.getRepoReadme).mockResolvedValue('# Project\n' + 'A'.repeat(500));
    vi.mocked(repos.getCommunityProfile).mockResolvedValue({
      files: { code_of_conduct: {}, contributing: {}, license: {}, readme: {} },
    } as any);
    vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(repos.getTopics).mockResolvedValue({ names: ['azure', 'javascript'] } as any);
    vi.mocked(repos.listReleases).mockResolvedValue([{ tag_name: 'v1.0.0' }] as any);
    vi.mocked(repos.fetchRepoMetadata).mockResolvedValue({ lastCommitDate: new Date().toISOString() } as any);
    vi.mocked(contents.getRootContents).mockResolvedValue([
      { name: '.gitignore', type: 'file' },
    ] as any);
    vi.mocked(actions.listRepoWorkflows).mockResolvedValue({
      total_count: 1, workflows: [{ id: 1, name: 'CI' }],
    } as any);
    vi.mocked(actions.getLatestWorkflowRun).mockResolvedValue({ conclusion: 'success' } as any);
    vi.mocked(actions.listWorkflowRuns).mockResolvedValue({ workflow_runs: [{ conclusion: 'success' }] } as any);
    vi.mocked(alerts.listDependabotAlerts).mockResolvedValue([] as any);
    vi.mocked(security.getBranchProtection).mockResolvedValue({ enabled: true } as any);
    vi.mocked(security.getAutomatedSecurityFixes).mockResolvedValue({ enabled: true } as any);

    const result = await checkReposHealth(client, ['org/healthy', 'org/broken']);

    expect(result.repos).toHaveLength(2);
    expect(result.summary.totalRepos).toBe(2);
    // First repo should score higher than second
    const scores = result.repos.map((r: RepoHealthCheck) => r.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it('should calculate grade distribution', async () => {
    mockHealthyRepo();

    const result = await checkReposHealth(client, ['org/repo1', 'org/repo2']);

    expect(result.summary.gradeDistribution).toBeDefined();
    const dist = result.summary.gradeDistribution;
    // Both healthy repos should get A grades
    const totalGrades = Object.values(dist).reduce((sum: number, count: unknown) => sum + (count as number), 0);
    expect(totalGrades).toBe(2);
  });

  it('should identify worst dimension', async () => {
    mockHealthyRepo();

    const result = await checkReposHealth(client, ['org/repo1']);

    expect(typeof result.summary.worstDimension).toBe('string');
    expect(result.summary.worstDimension.length).toBeGreaterThan(0);
  });
});

// ─── generateHealthSummary ───────────────────────────────────────────────────

describe('generateHealthSummary', () => {
  it('should produce a valid markdown string', () => {
    const report: HealthCheckReport = {
      repos: [
        {
          owner: 'Azure-Samples',
          repo: 'my-app',
          checkedAt: new Date().toISOString(),
          score: 85,
          grade: 'B',
          checks: [],
          dimensions: {
            documentation: { earned: 20, possible: 25, passRate: 0.8 },
            hygiene: { earned: 10, possible: 12, passRate: 0.83 },
            ci_cd: { earned: 15, possible: 20, passRate: 0.75 },
            dependency_freshness: { earned: 16, possible: 16, passRate: 1.0 },
            activity: { earned: 14, possible: 16, passRate: 0.875 },
            branch_protection: { earned: 5, possible: 5, passRate: 1.0 },
            azure: { earned: 5, possible: 7, passRate: 0.71 },
          },
        },
      ],
      summary: {
        totalRepos: 1,
        avgScore: 85,
        avgGrade: 'B',
        gradeDistribution: { A: 0, B: 1, C: 0, D: 0, F: 0 },
        worstDimension: 'azure',
        timestamp: new Date().toISOString(),
      },
    };

    const summary = generateHealthSummary(report);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('Health');
  });

  it('should include grade distribution in output', () => {
    const report: HealthCheckReport = {
      repos: [],
      summary: {
        totalRepos: 5,
        avgScore: 72,
        avgGrade: 'C',
        gradeDistribution: { A: 1, B: 2, C: 1, D: 1, F: 0 },
        worstDimension: 'ci_cd',
        timestamp: new Date().toISOString(),
      },
    };

    const summary = generateHealthSummary(report);
    // Should mention the total repos and average
    expect(summary).toContain('5');
    expect(summary).toContain('72');
  });

  it('should handle empty report with no repos', () => {
    const report: HealthCheckReport = {
      repos: [],
      summary: {
        totalRepos: 0,
        avgScore: 0,
        avgGrade: 'F',
        gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
        worstDimension: '',
        timestamp: new Date().toISOString(),
      },
    };

    const summary = generateHealthSummary(report);
    expect(typeof summary).toBe('string');
    expect(summary).toContain('0');
  });

  it('should include repo-level details when repos present', () => {
    const report: HealthCheckReport = {
      repos: [
        {
          owner: 'org',
          repo: 'repo-one',
          checkedAt: new Date().toISOString(),
          score: 95,
          grade: 'A',
          checks: [],
          dimensions: {},
        },
        {
          owner: 'org',
          repo: 'repo-two',
          checkedAt: new Date().toISOString(),
          score: 40,
          grade: 'D',
          checks: [],
          dimensions: {},
        },
      ],
      summary: {
        totalRepos: 2,
        avgScore: 67.5,
        avgGrade: 'C',
        gradeDistribution: { A: 1, B: 0, C: 0, D: 1, F: 0 },
        worstDimension: 'documentation',
        timestamp: new Date().toISOString(),
      },
    };

    const summary = generateHealthSummary(report);
    expect(summary).toContain('repo-one');
    expect(summary).toContain('repo-two');
  });
});

// ─── Type Contracts ──────────────────────────────────────────────────────────

describe('type contracts', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should export RepoHealthCheck with required fields', async () => {
    mockHealthyRepo();
    const result = await checkRepoHealth(client, 'test', 'repo');
    const check: RepoHealthCheck = result;

    expect(check.owner).toBeDefined();
    expect(check.repo).toBeDefined();
    expect(check.checkedAt).toBeDefined();
    expect(typeof check.score).toBe('number');
    expect(typeof check.grade).toBe('string');
    expect(Array.isArray(check.checks)).toBe(true);
    expect(typeof check.dimensions).toBe('object');
  });

  it('should export HealthCheckReport with summary', async () => {
    mockHealthyRepo();
    const result = await checkReposHealth(client, ['test/repo']);
    const report: HealthCheckReport = result;

    expect(report.repos).toBeDefined();
    expect(report.summary.totalRepos).toBeDefined();
    expect(report.summary.avgScore).toBeDefined();
    expect(report.summary.avgGrade).toBeDefined();
    expect(report.summary.gradeDistribution).toBeDefined();
    expect(report.summary.timestamp).toBeDefined();
  });
});
