import { GitHubClient, getPullRequestComments } from 'github-rest';

export async function fetchPRComments(owner: string, repo: string, prNumber: number, token?: string) {
  const client = new GitHubClient({ token });
  return await getPullRequestComments(client, owner, repo, prNumber);
}
