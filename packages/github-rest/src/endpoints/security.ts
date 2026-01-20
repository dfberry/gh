import type { GitHubClient } from '../core/client.js';

export async function getBranchProtection(client: GitHubClient, owner: string, repo: string, branch: string) {
  const path = `/repos/${owner}/${repo}/branches/${branch}/protection`;
  return client.get(path);
}

export async function listCollaborators(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/collaborators`;
  return client.get(path);
}

export async function listRepoSecrets(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/actions/secrets`;
  return client.get(path);
}
export async function getAutomatedSecurityFixes(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/automated-security-fixes`;
  return client.get(path);
}