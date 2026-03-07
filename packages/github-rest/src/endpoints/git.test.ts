import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { getRef, createRef, deleteRef } from './git.js';

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

describe('git', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  describe('getRef', () => {
    it('GETs /repos/{owner}/{repo}/git/ref/{ref}', async () => {
      const mockRef = {
        ref: 'refs/heads/main',
        node_id: 'MDM6UmVmMTI5NjI2OTpyZWZzL2hlYWRzL21haW4=',
        url: 'https://api.github.com/repos/octocat/hello-world/git/refs/heads/main',
        object: {
          sha: 'aa218f56b14c9653891f9e74264a383fa43fefbd',
          type: 'commit',
          url: 'https://api.github.com/repos/octocat/hello-world/git/commits/aa218f56b14c9653891f9e74264a383fa43fefbd',
        },
      };
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockRef);

      const result = await getRef(client, 'octocat', 'hello-world', 'heads/main');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/git/ref/heads/main'
      );
      expect(result).toEqual(mockRef);
    });

    it('strips refs/ prefix if provided', async () => {
      const mockRef = {
        ref: 'refs/heads/feature',
        node_id: 'node123',
        url: 'https://api.github.com/repos/octocat/hello-world/git/refs/heads/feature',
        object: { sha: 'abc123', type: 'commit', url: 'https://api.github.com/repos/octocat/hello-world/git/commits/abc123' },
      };
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockRef);

      await getRef(client, 'octocat', 'hello-world', 'refs/heads/feature');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/git/ref/heads/feature'
      );
    });

    it('propagates 404 for non-existent ref', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        getRef(client, 'octocat', 'hello-world', 'heads/nonexistent')
      ).rejects.toThrow('404');
    });
  });

  describe('createRef', () => {
    it('POSTs to /repos/{owner}/{repo}/git/refs with ref and sha', async () => {
      const mockRef = {
        ref: 'refs/heads/feature-branch',
        node_id: 'MDM6UmVmMTI5NjI2OTpyZWZzL2hlYWRzL2ZlYXR1cmUtYnJhbmNo',
        url: 'https://api.github.com/repos/octocat/hello-world/git/refs/heads/feature-branch',
        object: {
          sha: 'aa218f56b14c9653891f9e74264a383fa43fefbd',
          type: 'commit',
          url: 'https://api.github.com/repos/octocat/hello-world/git/commits/aa218f56b14c9653891f9e74264a383fa43fefbd',
        },
      };
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockRef);

      const result = await createRef(
        client,
        'octocat',
        'hello-world',
        'refs/heads/feature-branch',
        'aa218f56b14c9653891f9e74264a383fa43fefbd'
      );

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/git/refs',
        {
          ref: 'refs/heads/feature-branch',
          sha: 'aa218f56b14c9653891f9e74264a383fa43fefbd',
        }
      );
      expect(result).toEqual(mockRef);
    });

    it('propagates 422 for invalid SHA', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 422')
      );

      await expect(
        createRef(client, 'octocat', 'hello-world', 'refs/heads/test', 'invalid-sha')
      ).rejects.toThrow('422');
    });

    it('propagates 409 for duplicate ref', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 409')
      );

      await expect(
        createRef(client, 'octocat', 'hello-world', 'refs/heads/main', 'abc123')
      ).rejects.toThrow('409');
    });
  });

  describe('deleteRef', () => {
    it('DELETEs /repos/{owner}/{repo}/git/refs/{ref}', async () => {
      (client.del as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deleteRef(client, 'octocat', 'hello-world', 'heads/feature-branch');

      expect(client.del).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/git/refs/heads/feature-branch'
      );
    });

    it('strips refs/ prefix if provided', async () => {
      (client.del as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deleteRef(client, 'octocat', 'hello-world', 'refs/heads/feature');

      expect(client.del).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/git/refs/heads/feature'
      );
    });

    it('propagates 404 for non-existent ref', async () => {
      (client.del as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        deleteRef(client, 'octocat', 'hello-world', 'heads/nonexistent')
      ).rejects.toThrow('404');
    });

    it('propagates 422 for protected branch', async () => {
      (client.del as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 422')
      );

      await expect(
        deleteRef(client, 'octocat', 'hello-world', 'heads/main')
      ).rejects.toThrow('422');
    });
  });
});
