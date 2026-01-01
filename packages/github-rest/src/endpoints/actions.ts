import { GitHubClient } from '../core/client.js';

/**
 * List workflows for a repository. Returns the raw API response or `null` on error.
 */
export async function listRepoWorkflows(client: GitHubClient, owner: string, repo: string): Promise<any | null> {
  try {
    return await client.get<any>(`/repos/${owner}/${repo}/actions/workflows`);
  } catch (err) {
    return null;
  }
}

/**
 * Get a repository content entry by path. Returns the API response or `null` on error.
 */
export async function getRepoContent(client: GitHubClient, owner: string, repo: string, path: string): Promise<any | null> {
  try {
    return await client.get<any>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
  } catch (err) {
    return null;
  }
}

/**
 * List workflow runs for a workflow id. Returns the raw API response or `null` on error.
 */
export async function listWorkflowRuns(client: GitHubClient, owner: string, repo: string, workflowId: string | number, per_page = 50): Promise<any | null> {
  try {
    return await client.get<any>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${per_page}`);
  } catch (err) {
    return null;
  }
}
