import { createGitHubClient } from '../core/factory.js';

// Get branch protection for a branch
export async function getBranchProtection(owner: string, repo: string, branch: string) {
  const client = createGitHubClient();
  const path = `/repos/${owner}/${repo}/branches/${branch}/protection`;
  return client.get(path);
}

// List collaborators for a repo
export async function listCollaborators(owner: string, repo: string) {
  const client = createGitHubClient();
  const path = `/repos/${owner}/${repo}/collaborators`;
  return client.get(path);
}

// List repository actions secrets
export async function listRepoSecrets(owner: string, repo: string) {
  const client = createGitHubClient();
  const path = `/repos/${owner}/${repo}/actions/secrets`;
  return client.get(path);
}
