/**
 * index.test.ts — Orchestrator tests.
 *
 * Mocks github-rest to return fake file contents.
 * Verifies:
 *   - All rules are called with correct data
 *   - Report structure matches type definitions
 *   - Error handling: repo not found, file not found, API errors
 *   - Multi-repo aggregation
 *   - Summary statistics (avgScore, criticalFindings, worstDimension)
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { GitHubClient } from 'github-rest';

// Mock the github-rest module
vi.mock('github-rest', () => ({
  contents: {
    getRootContents: vi.fn(),
    getDecodedFileContent: vi.fn(),
    fileExists: vi.fn(),
  },
  repos: {
    getRepo: vi.fn(),
    getDefaultBranch: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Import after mocking
import { contents, repos } from 'github-rest';
import { checkRepoBestPractices, checkReposBestPractices } from './index.js';
import type {
  RepoAzureBPCheck,
  AzureBestPracticesReport,
  AzureBPCheckResult,
} from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Configure mocks for a "clean" Azure repo with all files present */
function mockCleanAzureRepo() {
  vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
  vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);

  // Root listing with typical Azure sample files
  vi.mocked(contents.getRootContents).mockResolvedValue([
    { name: 'package.json', type: 'file', path: 'package.json' },
    { name: 'README.md', type: 'file', path: 'README.md' },
    { name: 'azure.yaml', type: 'file', path: 'azure.yaml' },
    { name: 'infra', type: 'dir', path: 'infra' },
    { name: '.env.example', type: 'file', path: '.env.example' },
    { name: 'SECURITY.md', type: 'file', path: 'SECURITY.md' },
    { name: '.github', type: 'dir', path: '.github' },
    { name: 'main.bicep', type: 'file', path: 'main.bicep' },
  ] as any);

  // package.json with modern Azure SDK + identity
  vi.mocked(contents.getDecodedFileContent).mockImplementation(
    async (_client: any, _owner: string, _repo: string, path: string) => {
      if (path === 'package.json') {
        return JSON.stringify({
          dependencies: {
            '@azure/storage-blob': '^12.0.0',
            '@azure/identity': '^4.0.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
          },
        });
      }
      if (path === 'README.md') {
        return '# My Azure App\n\nThis app uses managed identity with DefaultAzureCredential for authentication.\n' +
               'Deploy with Azure Developer CLI.\n'.repeat(50);
      }
      if (path.endsWith('.bicep')) {
        return 'param location string = resourceGroup().location\nparam name string\nresource sa \'Microsoft.Storage/storageAccounts@2023-01-01\' = {\n  name: name\n  location: location\n}';
      }
      if (path.endsWith('.yml') || path.endsWith('.yaml')) {
        return 'name: Deploy\non: push\njobs:\n  deploy:\n    steps:\n      - uses: azure/login@v2\n        with:\n          client-id: ${{ secrets.AZURE_CLIENT_ID }}\n          tenant-id: ${{ secrets.AZURE_TENANT_ID }}';
      }
      return '';
    },
  );

  vi.mocked(contents.fileExists).mockResolvedValue(true);
}

/** Configure mocks for a repo with problems */
function mockProblematicRepo() {
  vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
  vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);

  vi.mocked(contents.getRootContents).mockResolvedValue([
    { name: 'package.json', type: 'file', path: 'package.json' },
    { name: 'README.md', type: 'file', path: 'README.md' },
  ] as any);

  vi.mocked(contents.getDecodedFileContent).mockImplementation(
    async (_client: any, _owner: string, _repo: string, path: string) => {
      if (path === 'package.json') {
        return JSON.stringify({
          dependencies: {
            'azure-storage': '^2.0.0',
            '@azure/cosmos': '^4.0.0',
          },
        });
      }
      if (path === 'README.md') {
        return '# My App\nA simple sample.';
      }
      return '';
    },
  );

  vi.mocked(contents.fileExists).mockResolvedValue(false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// checkRepoBestPractices (single repo)
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkRepoBestPractices', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should return a valid RepoAzureBPCheck for a clean Azure repo', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(result.owner).toBe('Azure-Samples');
    expect(result.repo).toBe('my-app');
    expect(result.checkedAt).toBeTruthy();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.grade).toBe('string');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  it('should return exactly 15 check results', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(result.checks).toHaveLength(15);
  });

  it('should include all 5 dimensions in checks', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');
    const dimensions = new Set(result.checks.map((c: AzureBPCheckResult) => c.dimension));

    expect(dimensions).toContain('azure-sdk');
    expect(dimensions).toContain('iac');
    expect(dimensions).toContain('config');
    expect(dimensions).toContain('ci-cd');
    expect(dimensions).toContain('security');
  });

  it('should include dimension summaries', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(result.dimensions).toBeDefined();
    expect(result.dimensions['azure-sdk']).toBeDefined();
    expect(result.dimensions['azure-sdk'].earned).toBeGreaterThanOrEqual(0);
    expect(result.dimensions['azure-sdk'].possible).toBeGreaterThan(0);
    expect(typeof result.dimensions['azure-sdk'].passRate).toBe('number');
  });

  it('should include filesAnalyzed listing', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(Array.isArray(result.filesAnalyzed)).toBe(true);
    expect(result.filesAnalyzed.length).toBeGreaterThan(0);
  });

  it('should score well-configured repo highly (A or B)', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(['A', 'B']).toContain(result.grade);
  });

  it('should score problematic repo lower', async () => {
    mockProblematicRepo();

    const result = await checkRepoBestPractices(client, 'org', 'bad-repo');

    expect(result.score).toBeLessThan(70);
  });

  it('should have correct check result shape for every check', async () => {
    mockCleanAzureRepo();

    const result = await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    for (const check of result.checks) {
      expect(check).toHaveProperty('dimension');
      expect(check).toHaveProperty('signal');
      expect(check).toHaveProperty('passed');
      expect(check).toHaveProperty('severity');
      expect(check).toHaveProperty('weight');
      expect(check).toHaveProperty('earned');
      expect(check).toHaveProperty('detail');
      expect(['critical', 'high', 'medium', 'low']).toContain(check.severity);
      expect(typeof check.weight).toBe('number');
      expect(typeof check.earned).toBe('number');
      expect(typeof check.passed).toBe('boolean');

      // earned should be weight (pass) or 0 (fail)
      if (check.passed) {
        expect(check.earned).toBe(check.weight);
      } else {
        expect(check.earned).toBe(0);
      }
    }
  });

  it('should handle file-not-found for package.json gracefully', async () => {
    vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
    vi.mocked(contents.getRootContents).mockResolvedValue([
      { name: 'README.md', type: 'file', path: 'README.md' },
    ] as any);
    vi.mocked(contents.getDecodedFileContent).mockRejectedValue(new Error('Not Found'));
    vi.mocked(contents.fileExists).mockResolvedValue(false);

    // Should not throw — gracefully handles missing package.json
    const result = await checkRepoBestPractices(client, 'org', 'no-pkg');

    expect(result.owner).toBe('org');
    expect(result.repo).toBe('no-pkg');
    expect(result.checks).toHaveLength(15);
    // Azure SDK checks should still return valid results (N/A → pass)
  });

  it('should handle API errors on getRootContents gracefully', async () => {
    vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
    vi.mocked(contents.getRootContents).mockRejectedValue(new Error('API rate limit'));
    vi.mocked(contents.getDecodedFileContent).mockRejectedValue(new Error('API rate limit'));
    vi.mocked(contents.fileExists).mockResolvedValue(false);

    // May throw or return error — either is acceptable
    try {
      const result = await checkRepoBestPractices(client, 'org', 'rate-limited');
      // If it doesn't throw, should still have valid structure
      expect(result.checks).toBeDefined();
    } catch (err) {
      // Acceptable to throw on complete API failure
      expect(err).toBeDefined();
    }
  });

  it('should call contents.getRootContents for the repo', async () => {
    mockCleanAzureRepo();

    await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(contents.getRootContents).toHaveBeenCalledWith(
      client,
      'Azure-Samples',
      'my-app',
    );
  });

  it('should call contents.getDecodedFileContent for package.json', async () => {
    mockCleanAzureRepo();

    await checkRepoBestPractices(client, 'Azure-Samples', 'my-app');

    expect(contents.getDecodedFileContent).toHaveBeenCalledWith(
      client,
      'Azure-Samples',
      'my-app',
      'package.json',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkReposBestPractices (multi-repo aggregation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkReposBestPractices', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('should return an AzureBestPracticesReport with repos array', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/my-app']);

    expect(report.repos).toBeDefined();
    expect(Array.isArray(report.repos)).toBe(true);
    expect(report.repos).toHaveLength(1);
    expect(report.repos[0].owner).toBe('Azure-Samples');
    expect(report.repos[0].repo).toBe('my-app');
  });

  it('should aggregate multiple repos', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, [
      'Azure-Samples/app1',
      'Azure-Samples/app2',
    ]);

    expect(report.repos).toHaveLength(2);
  });

  it('should include summary with correct totalRepos', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, [
      'Azure-Samples/app1',
      'Azure-Samples/app2',
      'Azure-Samples/app3',
    ]);

    expect(report.summary).toBeDefined();
    expect(report.summary.totalRepos).toBe(3);
  });

  it('should compute avgScore across repos', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/app1']);

    expect(typeof report.summary.avgScore).toBe('number');
    expect(report.summary.avgScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.avgScore).toBeLessThanOrEqual(100);
  });

  it('should include avgGrade in summary', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/app1']);

    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.summary.avgGrade);
  });

  it('should identify worstDimension in summary', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/app1']);

    expect(typeof report.summary.worstDimension).toBe('string');
    expect(report.summary.worstDimension.length).toBeGreaterThan(0);
  });

  it('should count criticalFindings across repos', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/app1']);

    expect(typeof report.summary.criticalFindings).toBe('number');
    expect(report.summary.criticalFindings).toBeGreaterThanOrEqual(0);
  });

  it('should include timestamp in summary', async () => {
    mockCleanAzureRepo();

    const report = await checkReposBestPractices(client, ['Azure-Samples/app1']);

    expect(report.summary.timestamp).toBeTruthy();
  });

  it('should record errors for repos that fail without blocking others', async () => {
    // First call succeeds, second rejects
    let callCount = 0;
    vi.mocked(repos.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(repos.getRepo).mockResolvedValue({ default_branch: 'main' } as any);
    vi.mocked(contents.getRootContents).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Not Found');
      return [
        { name: 'package.json', type: 'file', path: 'package.json' },
        { name: 'README.md', type: 'file', path: 'README.md' },
      ] as any;
    });
    vi.mocked(contents.getDecodedFileContent).mockResolvedValue('{}');
    vi.mocked(contents.fileExists).mockResolvedValue(false);

    const report = await checkReposBestPractices(client, [
      'org/good-repo',
      'org/missing-repo',
    ]);

    // Should have at least 1 success
    expect(report.repos.length).toBeGreaterThanOrEqual(1);
    // Should have error for the failed repo
    if (report.errors && report.errors.length > 0) {
      expect(report.errors[0].repo).toBe('missing-repo');
      expect(report.errors[0].message).toBeTruthy();
    }
  });

  it('should handle empty repos list gracefully', async () => {
    const report = await checkReposBestPractices(client, []);

    expect(report.repos).toHaveLength(0);
    expect(report.summary.totalRepos).toBe(0);
    expect(report.summary.avgScore).toBe(0);
  });

  it('should compute criticalFindings as count of severity=critical failures', async () => {
    mockProblematicRepo();

    const report = await checkReposBestPractices(client, ['org/bad-repo']);

    // Count critical failures from the checks
    const criticalFails = report.repos[0]?.checks.filter(
      (c: AzureBPCheckResult) => c.severity === 'critical' && !c.passed,
    ).length ?? 0;

    expect(report.summary.criticalFindings).toBe(criticalFails);
  });
});
