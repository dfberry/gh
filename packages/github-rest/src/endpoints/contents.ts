import type { GitHubClient } from '../core/client.js';
import { GitHubError } from '../core/errors.js';

/**
 * List files and folders at the root of the default branch for a repo.
 * Returns the array of contents (files/folders) or throws on error.
 */
export async function getRootContents(client: GitHubClient, owner: string, repo: string, branch?: string) {
  // If branch is not provided, fetch default branch
  let branchName: string = branch || '';
  if (!branchName) {
    const repoData: any = await client.get(`/repos/${owner}/${repo}`);
    branchName = typeof repoData?.default_branch === 'string' ? repoData.default_branch : 'main';
  }
  // The GitHub API for contents at root: /repos/:owner/:repo/contents?ref=branch
  return client.get(`/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branchName)}`);
}

/**
 * Get the contents of a file at a given path in a repo.
 * Re-exported from repos.ts for co-location with other content helpers.
 */
async function getContents(client: GitHubClient, owner: string, repo: string, path: string) {
  const safePath = encodeURIComponent(path).replace(/%2F/g, '/');
  return client.get(`/repos/${owner}/${repo}/contents/${safePath}`);
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
    const data = await getContents(client, owner, repo, path) as any;
    if (!data || !data.content) return null;
    const buff = Buffer.from(data.content, data.encoding ?? 'base64');
    return buff.toString('utf8');
  } catch (err: unknown) {
    if (err instanceof GitHubError && err.status === 404) {
      return null;
    }
    throw err;
  }
}