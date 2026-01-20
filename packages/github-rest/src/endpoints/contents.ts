import type { GitHubClient } from '../core/client.js';

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