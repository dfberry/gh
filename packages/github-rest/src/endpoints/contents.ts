import type { GitHubClient } from '../core/client.js';
import type { Repository } from '../types/index.js';
import { GitHubError } from '../core/errors.js';

export interface ContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  download_url: string | null;
}

export interface ContentFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
  type: string;
}

export interface GitUser {
  name: string;
  email: string;
  date: string;
}

export interface FileCommitResult {
  content: ContentFile;
  commit: {
    sha: string;
    node_id: string;
    url: string;
    html_url: string;
    author: GitUser;
    committer: GitUser;
    message: string;
  };
}

/**
 * List files and folders at the root of the default branch for a repo.
 * Returns the array of contents (files/folders) or throws on error.
 */
export async function getRootContents(client: GitHubClient, owner: string, repo: string, branch?: string): Promise<ContentItem[]> {
  // If branch is not provided, fetch default branch
  let branchName: string = branch || '';
  if (!branchName) {
    const repoData = await client.get<Repository>(`/repos/${owner}/${repo}`);
    branchName = typeof repoData?.default_branch === 'string' ? repoData.default_branch : 'main';
  }
  // The GitHub API for contents at root: /repos/:owner/:repo/contents?ref=branch
  return client.get<ContentItem[]>(`/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branchName)}`);
}

/**
 * Get the contents of a file at a given path in a repo.
 * Re-exported from repos.ts for co-location with other content helpers.
 */
async function getContents(client: GitHubClient, owner: string, repo: string, path: string): Promise<ContentFile> {
  const safePath = encodeURIComponent(path).replace(/%2F/g, '/');
  return client.get<ContentFile>(`/repos/${owner}/${repo}/contents/${safePath}`);
}

/**
 * Check whether a file exists at the given path in a repo.
 * Returns true if the file exists, false on 404, and throws on other errors.
 */
export async function fileExists(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string
): Promise<boolean> {
  try {
    await getContents(client, owner, repo, path);
    return true;
  } catch (err: unknown) {
    if (err instanceof GitHubError && err.status === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Get the decoded UTF-8 string content of a file at the given path.
 * Returns null on 404, the decoded string on success, and throws on other errors.
 */
export async function getDecodedFileContent(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const data = await getContents(client, owner, repo, path);
    if (!data || !data.content) return null;
    const buff = Buffer.from(data.content, (data.encoding ?? 'base64') as BufferEncoding);
    return buff.toString('utf8');
  } catch (err: unknown) {
    if (err instanceof GitHubError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// --- Write Operations ---

/**
 * Helper: encode string to base64.
 * GitHub's Contents API requires base64-encoded content for file writes.
 */
export function encodeContent(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64');
}

/**
 * Create or update a file in a repository.
 * PUT /repos/{owner}/{repo}/contents/{path}
 * 
 * @param path - Path where the file should be created/updated
 * @param options.message - Commit message
 * @param options.content - File content (will be base64-encoded automatically)
 * @param options.branch - Branch to commit to (optional, defaults to repo's default branch)
 * @param options.sha - Required for updates; the blob SHA of the file being replaced
 */
export async function createOrUpdateFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  options: {
    message: string;
    content: string;
    branch?: string;
    sha?: string;
  },
): Promise<FileCommitResult> {
  const safePath = encodeURIComponent(path).replace(/%2F/g, '/');
  const payload: Record<string, string> = {
    message: options.message,
    content: encodeContent(options.content),
  };
  
  if (options.branch !== undefined) {
    payload.branch = options.branch;
  }
  
  if (options.sha !== undefined) {
    payload.sha = options.sha;
  }

  return client.request<FileCommitResult>('PUT', `/repos/${owner}/${repo}/contents/${safePath}`, {
    body: payload,
  });
}

/**
 * Delete a file from a repository.
 * DELETE /repos/{owner}/{repo}/contents/{path}
 * 
 * @param path - Path to the file to delete
 * @param options.message - Commit message
 * @param options.sha - Required; the blob SHA of the file being removed
 * @param options.branch - Branch to commit to (optional, defaults to repo's default branch)
 */
export async function deleteFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  options: {
    message: string;
    sha: string;
    branch?: string;
  },
): Promise<FileCommitResult> {
  const safePath = encodeURIComponent(path).replace(/%2F/g, '/');
  const payload: Record<string, string> = {
    message: options.message,
    sha: options.sha,
  };
  
  if (options.branch !== undefined) {
    payload.branch = options.branch;
  }

  return client.request<FileCommitResult>('DELETE', `/repos/${owner}/${repo}/contents/${safePath}`, {
    body: payload,
  });
}