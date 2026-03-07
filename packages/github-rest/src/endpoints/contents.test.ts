import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { GitHubError } from '../core/errors.js';
import { 
  fileExists, 
  getDecodedFileContent,
  encodeContent,
  createOrUpdateFile,
  deleteFile
} from './contents.js';

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

describe('fileExists', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('returns true when file exists', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'README.md',
      type: 'file',
      content: 'dGVzdA==',
    });

    const result = await fileExists(client, 'octocat', 'hello', 'README.md');

    expect(result).toBe(true);
    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello/contents/README.md');
  });

  it('returns false on 404', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GitHubError('GitHub API error 404', 404, {})
    );

    const result = await fileExists(client, 'octocat', 'hello', 'MISSING.md');

    expect(result).toBe(false);
  });

  it('throws on non-404 errors', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GitHubError('GitHub API error 500', 500, {})
    );

    await expect(
      fileExists(client, 'octocat', 'hello', 'README.md')
    ).rejects.toThrow('GitHub API error 500');
  });

  it('handles nested paths', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'config.yml',
      type: 'file',
    });

    const result = await fileExists(client, 'octocat', 'hello', '.github/config.yml');

    expect(result).toBe(true);
    expect(client.get).toHaveBeenCalledWith('/repos/octocat/hello/contents/.github/config.yml');
  });
});

describe('getDecodedFileContent', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('decodes base64 content to UTF-8 string', async () => {
    const textContent = 'Hello, World!';
    const base64Content = Buffer.from(textContent).toString('base64');
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'README.md',
      type: 'file',
      content: base64Content,
      encoding: 'base64',
    });

    const result = await getDecodedFileContent(client, 'octocat', 'hello', 'README.md');

    expect(result).toBe(textContent);
  });

  it('returns null on 404', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GitHubError('GitHub API error 404', 404, {})
    );

    const result = await getDecodedFileContent(client, 'octocat', 'hello', 'MISSING.md');

    expect(result).toBeNull();
  });

  it('returns null when content is empty/missing', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'empty.txt',
      type: 'file',
      content: null,
    });

    const result = await getDecodedFileContent(client, 'octocat', 'hello', 'empty.txt');

    expect(result).toBeNull();
  });

  it('throws on non-404 errors', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GitHubError('GitHub API error 403', 403, {})
    );

    await expect(
      getDecodedFileContent(client, 'octocat', 'hello', 'secret.txt')
    ).rejects.toThrow('GitHub API error 403');
  });

  it('defaults to base64 encoding when encoding field is missing', async () => {
    const textContent = 'default encoding test';
    const base64Content = Buffer.from(textContent).toString('base64');
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'file.txt',
      type: 'file',
      content: base64Content,
    });

    const result = await getDecodedFileContent(client, 'octocat', 'hello', 'file.txt');

    expect(result).toBe(textContent);
  });
});

describe('encodeContent', () => {
  it('encodes UTF-8 string to base64', () => {
    const result = encodeContent('Hello, World!');
    const expected = Buffer.from('Hello, World!').toString('base64');
    expect(result).toBe(expected);
  });

  it('handles empty string', () => {
    const result = encodeContent('');
    expect(result).toBe('');
  });

  it('handles multi-line content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const result = encodeContent(content);
    const expected = Buffer.from(content).toString('base64');
    expect(result).toBe(expected);
  });

  it('handles special characters', () => {
    const content = '{ "key": "value", "emoji": "🚀" }';
    const result = encodeContent(content);
    const decoded = Buffer.from(result, 'base64').toString('utf8');
    expect(decoded).toBe(content);
  });
});

describe('createOrUpdateFile', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('PUTs to /repos/{owner}/{repo}/contents/{path} with encoded content', async () => {
    const mockResult = {
      content: {
        name: 'test.txt',
        path: 'test.txt',
        sha: 'abc123',
        size: 13,
        content: Buffer.from('Test content').toString('base64'),
        encoding: 'base64',
        type: 'file',
      },
      commit: {
        sha: 'commit123',
        node_id: 'node123',
        url: 'https://api.github.com/repos/octocat/hello/git/commits/commit123',
        html_url: 'https://github.com/octocat/hello/commit/commit123',
        author: { name: 'Author', email: 'author@example.com', date: '2024-01-01T00:00:00Z' },
        committer: { name: 'Committer', email: 'committer@example.com', date: '2024-01-01T00:00:00Z' },
        message: 'Create test file',
      },
    };
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await createOrUpdateFile(
      client,
      'octocat',
      'hello',
      'test.txt',
      {
        message: 'Create test file',
        content: 'Test content',
      }
    );

    expect(client.request).toHaveBeenCalledWith(
      'PUT',
      '/repos/octocat/hello/contents/test.txt',
      {
        body: {
          message: 'Create test file',
          content: Buffer.from('Test content').toString('base64'),
        },
      }
    );
    expect(result).toEqual(mockResult);
  });

  it('includes branch when provided', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: { name: 'test.txt' },
      commit: { sha: 'abc' },
    });

    await createOrUpdateFile(client, 'octocat', 'hello', 'test.txt', {
      message: 'Update on branch',
      content: 'content',
      branch: 'feature-branch',
    });

    expect(client.request).toHaveBeenCalledWith(
      'PUT',
      '/repos/octocat/hello/contents/test.txt',
      {
        body: expect.objectContaining({
          branch: 'feature-branch',
        }),
      }
    );
  });

  it('includes sha for updates', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: { name: 'existing.txt' },
      commit: { sha: 'def' },
    });

    await createOrUpdateFile(client, 'octocat', 'hello', 'existing.txt', {
      message: 'Update existing file',
      content: 'updated content',
      sha: 'existing-sha-123',
    });

    expect(client.request).toHaveBeenCalledWith(
      'PUT',
      '/repos/octocat/hello/contents/existing.txt',
      {
        body: expect.objectContaining({
          sha: 'existing-sha-123',
        }),
      }
    );
  });

  it('handles nested paths', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: { name: 'config.yml' },
      commit: { sha: 'ghi' },
    });

    await createOrUpdateFile(client, 'octocat', 'hello', '.github/config.yml', {
      message: 'Add config',
      content: 'key: value',
    });

    expect(client.request).toHaveBeenCalledWith(
      'PUT',
      '/repos/octocat/hello/contents/.github/config.yml',
      expect.any(Object)
    );
  });

  it('propagates 409 conflict errors', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 409')
    );

    await expect(
      createOrUpdateFile(client, 'octocat', 'hello', 'test.txt', {
        message: 'Conflicting update',
        content: 'content',
        sha: 'wrong-sha',
      })
    ).rejects.toThrow('409');
  });
});

describe('deleteFile', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('DELETEs /repos/{owner}/{repo}/contents/{path} with sha', async () => {
    const mockResult = {
      content: null,
      commit: {
        sha: 'commit456',
        node_id: 'node456',
        url: 'https://api.github.com/repos/octocat/hello/git/commits/commit456',
        html_url: 'https://github.com/octocat/hello/commit/commit456',
        author: { name: 'Author', email: 'author@example.com', date: '2024-01-01T00:00:00Z' },
        committer: { name: 'Committer', email: 'committer@example.com', date: '2024-01-01T00:00:00Z' },
        message: 'Delete file',
      },
    };
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const result = await deleteFile(client, 'octocat', 'hello', 'old.txt', {
      message: 'Delete file',
      sha: 'file-sha-123',
    });

    expect(client.request).toHaveBeenCalledWith(
      'DELETE',
      '/repos/octocat/hello/contents/old.txt',
      {
        body: {
          message: 'Delete file',
          sha: 'file-sha-123',
        },
      }
    );
    expect(result).toEqual(mockResult);
  });

  it('includes branch when provided', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: null,
      commit: { sha: 'xyz' },
    });

    await deleteFile(client, 'octocat', 'hello', 'file.txt', {
      message: 'Delete from branch',
      sha: 'sha123',
      branch: 'cleanup-branch',
    });

    expect(client.request).toHaveBeenCalledWith(
      'DELETE',
      '/repos/octocat/hello/contents/file.txt',
      {
        body: expect.objectContaining({
          branch: 'cleanup-branch',
        }),
      }
    );
  });

  it('handles nested paths', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: null,
      commit: { sha: 'mnop' },
    });

    await deleteFile(client, 'octocat', 'hello', 'docs/old/file.md', {
      message: 'Remove old doc',
      sha: 'doc-sha',
    });

    expect(client.request).toHaveBeenCalledWith(
      'DELETE',
      '/repos/octocat/hello/contents/docs/old/file.md',
      expect.any(Object)
    );
  });

  it('propagates 404 for missing file', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 404')
    );

    await expect(
      deleteFile(client, 'octocat', 'hello', 'nonexistent.txt', {
        message: 'Delete missing',
        sha: 'wrong-sha',
      })
    ).rejects.toThrow('404');
  });

  it('propagates 409 for sha mismatch', async () => {
    (client.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 409')
    );

    await expect(
      deleteFile(client, 'octocat', 'hello', 'file.txt', {
        message: 'Delete with wrong SHA',
        sha: 'outdated-sha',
      })
    ).rejects.toThrow('409');
  });
});

