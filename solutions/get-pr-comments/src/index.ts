import { GitHubClient } from 'github-rest';

export type PullRequestCommentsResult = {
  issueComments: unknown[];
  reviewComments: unknown[];
  reviews: unknown[];
};

export async function fetchPRComments(owner: string, repo: string, prNumber: number, token?: string): Promise<PullRequestCommentsResult> {
  const client = new GitHubClient({ token });
  if (token) {
    await client.getAuthenticatedUser();
  }

  const [issueComments, reviewComments, reviews] = await Promise.all([
    client.get<unknown[]>(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, { params: { per_page: 100 } }),
    client.get<unknown[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, { params: { per_page: 100 } }),
    client.get<unknown[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, { params: { per_page: 100 } }),
  ]);

  return { issueComments, reviewComments, reviews };
}
