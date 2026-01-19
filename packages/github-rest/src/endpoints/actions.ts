
import { GitHubClient } from '../core/client.js';

export async function listRepoWorkflows(client: GitHubClient, owner: string, repo: string): Promise<any | null> {
    return await client.get<any>(`/repos/${owner}/${repo}/actions/workflows`);
}

export async function listWorkflowRuns(client: GitHubClient, owner: string, repo: string, workflowId: string | number, per_page = 50): Promise<any | null> {
    return await client.get<any>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${per_page}`);
}
export async function listAllRepoActionRuns(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}/actions/runs`);
}