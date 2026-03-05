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

import {
  createIssue,
  listIssues,
  getIssue,
  updateIssue,
  addLabelsToIssue,
  createLabel,
  listLabels,
} from './issues.js';

describe('issues', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  describe('createIssue', () => {
    it('POSTs to /repos/{owner}/{repo}/issues with title and body', async () => {
      const mockIssue = {
        id: 1,
        number: 42,
        title: 'Bug report',
        body: 'Something is broken',
        state: 'open',
        html_url: 'https://github.com/octocat/hello-world/issues/42',
        labels: [],
        assignees: [],
      };
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssue);

      const result = await createIssue(
        client, 'octocat', 'hello-world', 'Bug report', 'Something is broken'
      );

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues',
        expect.objectContaining({ title: 'Bug report', body: 'Something is broken' })
      );
      expect(result).toEqual(mockIssue);
    });

    it('includes labels and assignees when provided', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({ number: 1 });

      await createIssue(
        client, 'octocat', 'hello-world', 'Title', undefined, ['bug'], ['user1']
      );

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues',
        expect.objectContaining({
          title: 'Title',
          labels: ['bug'],
          assignees: ['user1'],
        })
      );
    });

    it('propagates 422 validation errors', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 422')
      );

      await expect(
        createIssue(client, 'octocat', 'hello-world', '')
      ).rejects.toThrow('422');
    });
  });

  describe('listIssues', () => {
    it('GETs /repos/{owner}/{repo}/issues', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Issue 1', state: 'open' },
        { id: 2, number: 2, title: 'Issue 2', state: 'closed' },
      ];
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssues);

      const result = await listIssues(client, 'octocat', 'hello-world');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues',
        expect.any(Object)
      );
      expect(result).toEqual(mockIssues);
    });

    it('passes state and label filters as query params', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await listIssues(client, 'octocat', 'hello-world', 'open', 'bug,enhancement');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues',
        expect.objectContaining({
          params: expect.objectContaining({ state: 'open', labels: 'bug,enhancement' }),
        })
      );
    });

    it('propagates 404 errors', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        listIssues(client, 'octocat', 'nonexistent-repo')
      ).rejects.toThrow('404');
    });
  });

  describe('getIssue', () => {
    it('GETs /repos/{owner}/{repo}/issues/{issue_number}', async () => {
      const mockIssue = {
        id: 1,
        number: 42,
        title: 'Specific issue',
        state: 'open',
        body: 'Details here',
      };
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssue);

      const result = await getIssue(client, 'octocat', 'hello-world', 42);

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues/42'
      );
      expect(result).toEqual(mockIssue);
    });

    it('propagates 404 for missing issue', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        getIssue(client, 'octocat', 'hello-world', 99999)
      ).rejects.toThrow('404');
    });
  });

  describe('updateIssue', () => {
    it('PATCHes /repos/{owner}/{repo}/issues/{issue_number}', async () => {
      const updatedIssue = {
        id: 1,
        number: 42,
        title: 'Updated title',
        state: 'closed',
      };
      (client.patch as ReturnType<typeof vi.fn>).mockResolvedValue(updatedIssue);

      const result = await updateIssue(client, 'octocat', 'hello-world', 42, {
        title: 'Updated title',
        state: 'closed',
      });

      expect(client.patch).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues/42',
        expect.objectContaining({ title: 'Updated title', state: 'closed' })
      );
      expect(result).toEqual(updatedIssue);
    });

    it('propagates 422 for invalid updates', async () => {
      (client.patch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 422')
      );

      await expect(
        updateIssue(client, 'octocat', 'hello-world', 42, { state: 'invalid' as any })
      ).rejects.toThrow('422');
    });
  });

  describe('addLabelsToIssue', () => {
    it('POSTs to /repos/{owner}/{repo}/issues/{issue_number}/labels', async () => {
      const mockLabels = [
        { id: 1, name: 'bug', color: 'fc2929' },
        { id: 2, name: 'priority', color: '0e8a16' },
      ];
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockLabels);

      const result = await addLabelsToIssue(
        client, 'octocat', 'hello-world', 42, ['bug', 'priority']
      );

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/issues/42/labels',
        expect.objectContaining({ labels: ['bug', 'priority'] })
      );
      expect(result).toEqual(mockLabels);
    });

    it('propagates 404 for missing issue', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        addLabelsToIssue(client, 'octocat', 'hello-world', 99999, ['bug'])
      ).rejects.toThrow('404');
    });
  });

  describe('createLabel', () => {
    it('POSTs to /repos/{owner}/{repo}/labels with name and color', async () => {
      const mockLabel = {
        id: 1,
        name: 'security',
        color: 'e11d48',
        description: 'Security-related issues',
      };
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockLabel);

      const result = await createLabel(
        client, 'octocat', 'hello-world', 'security', 'e11d48', 'Security-related issues'
      );

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/labels',
        expect.objectContaining({
          name: 'security',
          color: 'e11d48',
          description: 'Security-related issues',
        })
      );
      expect(result).toEqual(mockLabel);
    });

    it('works with name only (no color or description)', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, name: 'test' });

      await createLabel(client, 'octocat', 'hello-world', 'test');

      expect(client.post).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/labels',
        expect.objectContaining({ name: 'test' })
      );
    });

    it('propagates 422 for duplicate label', async () => {
      (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 422')
      );

      await expect(
        createLabel(client, 'octocat', 'hello-world', 'bug')
      ).rejects.toThrow('422');
    });
  });

  describe('listLabels', () => {
    it('GETs /repos/{owner}/{repo}/labels', async () => {
      const mockLabels = [
        { id: 1, name: 'bug', color: 'fc2929' },
        { id: 2, name: 'enhancement', color: '84b6eb' },
      ];
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockLabels);

      const result = await listLabels(client, 'octocat', 'hello-world');

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/labels',
        expect.any(Object)
      );
      expect(result).toEqual(mockLabels);
    });

    it('passes pagination params', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await listLabels(client, 'octocat', 'hello-world', 50, 2);

      expect(client.get).toHaveBeenCalledWith(
        '/repos/octocat/hello-world/labels',
        expect.objectContaining({
          params: expect.objectContaining({ per_page: 50, page: 2 }),
        })
      );
    });

    it('propagates 404 for missing repo', async () => {
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('GitHub API error 404')
      );

      await expect(
        listLabels(client, 'octocat', 'nonexistent')
      ).rejects.toThrow('404');
    });
  });
});
