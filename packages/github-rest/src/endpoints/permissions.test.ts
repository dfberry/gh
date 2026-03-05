import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';

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

// Mock repos.getDefaultBranch so we control what branch name is returned
vi.mock('./repos.js', () => ({
  getDefaultBranch: vi.fn(),
  getRepo: vi.fn(),
}));

// Mock security module since permissions.ts delegates to it
vi.mock('./security.js', () => ({
  listCollaborators: vi.fn(),
  listRepoSecrets: vi.fn(),
}));

import { getBranchProtection, getDefaultBranchProtection } from './permissions.js';
import { getDefaultBranch } from './repos.js';

describe('permissions', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  describe('getBranchProtection', () => {
    it('calls GET /repos/{owner}/{repo}/branches/{branch}/protection', async () => {
      const mockProtection = {
        required_status_checks: { strict: true, contexts: ['ci'] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: { required_approving_review_count: 1 },
      };
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProtection);

      const result = await getBranchProtection(client, 'octocat', 'hello-world', 'main');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/branches/main/protection'
      );
      expect(result).toEqual(mockProtection);
    });

    it('propagates API errors', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        getBranchProtection(client, 'octocat', 'hello-world', 'nonexistent')
      ).rejects.toThrow('GitHub API error 404');
    });

    it('encodes branch names with special characters', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await getBranchProtection(client, 'octocat', 'hello-world', 'feature/test');

      // Branch name with slash is URL-encoded
      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/branches/feature%2Ftest/protection'
      );
    });
  });

  describe('getDefaultBranchProtection', () => {
    it('gets default branch then fetches its protection', async () => {
      vi.mocked(getDefaultBranch).mockResolvedValue('main');
      const mockProtection = {
        enforce_admins: { enabled: false },
      };
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProtection);

      const result = await getDefaultBranchProtection(client, 'octocat', 'hello-world');

      expect(getDefaultBranch).toHaveBeenCalledWith(client, 'octocat', 'hello-world');
      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/branches/main/protection'
      );
      expect(result).toEqual(mockProtection);
    });

    it('throws when default branch is not found', async () => {
      vi.mocked(getDefaultBranch).mockResolvedValue(undefined);

      await expect(
        getDefaultBranchProtection(client, 'octocat', 'hello-world')
      ).rejects.toThrow('Default branch not found');
    });

    it('propagates errors from getBranchProtection', async () => {
      vi.mocked(getDefaultBranch).mockResolvedValue('main');
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 403')
      );

      await expect(
        getDefaultBranchProtection(client, 'octocat', 'hello-world')
      ).rejects.toThrow('GitHub API error 403');
    });
  });
});
