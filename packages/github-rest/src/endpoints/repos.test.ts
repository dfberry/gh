import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { getCommunityProfile } from './repos.js';

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
