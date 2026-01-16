/**
 * Get all comments on a pull request (issue comments and review comments).
 * @param client GitHubClient instance
 * @param owner Repository owner
 * @param repo Repository name
 * @param prNumber Pull request number
 * @returns Object with issue comments and review comments arrays
 */
import type { GitHubClient } from '../core/client.js';

export async function getPullRequestComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ issueComments: any[]; reviewComments: any[] }> {
  // Issue comments (general comments on the PR)
  const issueComments = await client.get<any[]>(`/repos/${owner}/${repo}/issues/${prNumber}/comments`).catch(() => []);
  // Review comments (comments on code diffs)
  const reviewComments = await client.get<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`).catch(() => []);
  return { issueComments, reviewComments };
}
