import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { 
  getCommunityProfile,
  getDefaultBranchSHA,
  findPRByBranch
} from './repos.js';

function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
    rawRequest: vi.fn(),
  } as unknown as GitHubClient;
}

describe('getCommunityProfile', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('calls GET /repos/{owner}/{repo}/community/profile', async () => {
    const mockProfile = {
      health_percentage: 85,
      description: 'A sample repo',
      documentation: null,
      files: {
        code_of_conduct: null,
        code_of_conduct_file: null,
        contributing: { url: 'https://api.github.com/repos/octocat/hello/contents/CONTRIBUTING.md', html_url: 'https://github.com/octocat/hello/blob/main/CONTRIBUTING.md' },
        issue_template: null,
        pull_request_template: null,
        license: { name: 'MIT License', spdx_id: 'MIT', url: 'https://api.github.com/licenses/mit', html_url: 'https://github.com/octocat/hello/blob/main/LICENSE' },
        readme: { url: 'https://api.github.com/repos/octocat/hello/contents/README.md', html_url: 'https://github.com/octocat/hello/blob/main/README.md' },
      },
      updated_at: '2024-01-01T00:00:00Z',
      content_reports_enabled: false,
    };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfile);

    const result = await getCommunityProfile(client, 'octocat', 'hello');

    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello/community/profile');
    expect(result).toEqual(mockProfile);
    expect(result.health_percentage).toBe(85);
    expect(result.files.license).not.toBeNull();
    expect(result.files.code_of_conduct).toBeNull();
  });

  it('returns profile with 100% health', async () => {
    const perfectProfile = {
      health_percentage: 100,
      description: 'Healthy repo',
      documentation: 'https://docs.example.com',
      files: {
        code_of_conduct: { name: 'Contributor Covenant', url: 'https://api.github.com/codes_of_conduct/contributor_covenant' },
        code_of_conduct_file: { url: 'u', html_url: 'h' },
        contributing: { url: 'u', html_url: 'h' },
        issue_template: { url: 'u', html_url: 'h' },
        pull_request_template: { url: 'u', html_url: 'h' },
        license: { name: 'MIT', spdx_id: 'MIT', url: 'u', html_url: 'h' },
        readme: { url: 'u', html_url: 'h' },
      },
      updated_at: '2024-06-01T00:00:00Z',
      content_reports_enabled: true,
    };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(perfectProfile);

    const result = await getCommunityProfile(client, 'org', 'repo');
    expect(result.health_percentage).toBe(100);
    expect(result.files.code_of_conduct).not.toBeNull();
  });

  it('propagates API errors', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 404')
    );

    await expect(
      getCommunityProfile(client, 'octocat', 'nonexistent')
    ).rejects.toThrow('GitHub API error 404');
  });
});

describe('getDefaultBranchSHA', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('returns SHA of the default branch HEAD', async () => {
    const mockRepo = {
      default_branch: 'main',
      owner: { login: 'octocat' },
      name: 'hello',
    };
    const mockRef = {
      object: {
        sha: 'abc123def456',
      },
    };
    
    (client.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRepo)  // getRepo call
      .mockResolvedValueOnce(mockRef);   // git ref call

    const result = await getDefaultBranchSHA(client, 'octocat', 'hello');

    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello');
    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello/git/ref/heads/main');
    expect(result).toBe('abc123def456');
  });

  it('falls back to main when default_branch is undefined', async () => {
    const mockRepo = {
      owner: { login: 'octocat' },
      name: 'hello',
    };
    const mockRef = {
      object: {
        sha: 'fallback-sha',
      },
    };
    
    (client.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRepo)
      .mockResolvedValueOnce(mockRef);

    const result = await getDefaultBranchSHA(client, 'octocat', 'hello');

    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello/git/ref/heads/main');
    expect(result).toBe('fallback-sha');
  });

  it('handles custom default branch names', async () => {
    const mockRepo = {
      default_branch: 'develop',
      owner: { login: 'org' },
      name: 'project',
    };
    const mockRef = {
      object: {
        sha: 'develop-sha-789',
      },
    };
    
    (client.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRepo)
      .mockResolvedValueOnce(mockRef);

    const result = await getDefaultBranchSHA(client, 'org', 'project');

    expect(client.get).toHaveBeenCalledWith('/repos/org/project/git/ref/heads/develop');
    expect(result).toBe('develop-sha-789');
  });

  it('propagates errors when repository not found', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 404')
    );

    await expect(
      getDefaultBranchSHA(client, 'octocat', 'nonexistent')
    ).rejects.toThrow('GitHub API error 404');
  });

  it('propagates errors when branch ref not found', async () => {
    const mockRepo = {
      default_branch: 'main',
      owner: { login: 'octocat' },
      name: 'hello',
    };
    
    (client.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockRepo)
      .mockRejectedValueOnce(new Error('GitHub API error 404'));

    await expect(
      getDefaultBranchSHA(client, 'octocat', 'hello')
    ).rejects.toThrow('GitHub API error 404');
  });
});

describe('findPRByBranch', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('returns PR number when open PR exists for branch', async () => {
    const mockPRs = [
      {
        number: 42,
        state: 'open',
        title: 'Feature PR',
        head: { ref: 'feature-branch', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        html_url: 'https://github.com/octocat/hello/pull/42',
      },
    ];
    
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPRs);

    const result = await findPRByBranch(client, 'octocat', 'hello', 'feature-branch');

    expect(client.get).toHaveBeenCalledWith(
      '/repos/octocat/hello/pulls',
      expect.objectContaining({
        params: expect.objectContaining({
          state: 'open',
          head: 'octocat:feature-branch',
        }),
      })
    );
    expect(result).toBe(42);
  });

  it('returns null when no PR exists for branch', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await findPRByBranch(client, 'octocat', 'hello', 'nonexistent-branch');

    expect(result).toBeNull();
  });

  it('returns first PR number when multiple PRs exist', async () => {
    const mockPRs = [
      {
        number: 10,
        state: 'open',
        title: 'First PR',
        head: { ref: 'shared-branch', sha: 'sha1' },
        base: { ref: 'main', sha: 'sha2' },
        html_url: 'https://github.com/octocat/hello/pull/10',
      },
      {
        number: 11,
        state: 'open',
        title: 'Second PR',
        head: { ref: 'shared-branch', sha: 'sha1' },
        base: { ref: 'develop', sha: 'sha3' },
        html_url: 'https://github.com/octocat/hello/pull/11',
      },
    ];
    
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockPRs);

    const result = await findPRByBranch(client, 'octocat', 'hello', 'shared-branch');

    expect(result).toBe(10);
  });

  it('propagates API errors', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 403')
    );

    await expect(
      findPRByBranch(client, 'octocat', 'private-repo', 'branch')
    ).rejects.toThrow('GitHub API error 403');
  });
});

