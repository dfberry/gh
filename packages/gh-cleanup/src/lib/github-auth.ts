import { GitHubClient } from 'github-rest';

export function getGitHubClient(): GitHubClient {
  const token = process.env.GH_TOKEN || '';
  if (!token) {
    console.error('Error: GH_TOKEN environment variable is required for GitHub API access.');
    throw new Error('GH_TOKEN environment variable is required');
  } else {
    console.log('Using GH_TOKEN starting with ', token.slice(0, 10).padEnd(token.length, '*'));
  }

  return new GitHubClient({ token, userAgent: 'gh-cleanup/actions' });
}
