import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { GitHubError } from '../core/errors.js';
import { fileExists, getDecodedFileContent } from './contents.js';

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
