import type { GitHubClient } from '../core/client.js';

export async function getRepo(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}`);
}

export async function getReadme(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}/readme`);
}

export async function getTopics(client: GitHubClient, owner: string, repo: string) {
  const res = await client.rawRequest(`/repos/${owner}/${repo}/topics`.startsWith('http') ? 'GET' : 'GET', `/repos/${owner}/${repo}/topics`, { });
  return res.body;
}

export async function updateTopics(client: GitHubClient, owner: string, repo: string, topics: string[]) {
  return client.request('PUT', `/repos/${owner}/${repo}/topics`, { body: { names: topics } } as any);
}

export async function updateRepo(client: GitHubClient, owner: string, repo: string, patch: Record<string, unknown>) {
  return client.patch(`/repos/${owner}/${repo}`, patch);
}

export async function listContributors(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}/contributors`);
}

export async function listReleases(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}/releases`);
}

export async function getContents(client: GitHubClient, owner: string, repo: string, path: string) {
  const safePath = encodeURIComponent(path).replace(/%2F/g, '/');
  return client.get(`/repos/${owner}/${repo}/contents/${safePath}`);
}

export async function getUserProfile(client: GitHubClient, username: string) {
  return client.get(`/users/${username}`);
}
