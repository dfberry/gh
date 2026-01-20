
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

