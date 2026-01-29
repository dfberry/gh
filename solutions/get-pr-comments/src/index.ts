import { GitHubClient, getPullRequestComments } from 'github-rest';

export async function fetchPRComments(
  owner: string,
  repo: string,
  prNumber: number,
  username?: string,
  token?: string
) {
  const client = new GitHubClient({ token });
  const comments = await getPullRequestComments(client, owner, repo, prNumber);

  // If no username filter is provided, return all comments
  if (!username) {
    return comments;
  }

  // Filter comments by username
  return {
    issueComments: comments.issueComments.filter(
      (comment: any) => comment.user?.login === username
    ),
    reviewComments: comments.reviewComments.filter(
      (comment: any) => comment.user?.login === username
    ),
  };
}
