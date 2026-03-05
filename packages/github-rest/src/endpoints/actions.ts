
import type { GitHubClient } from '../core/client.js';

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface WorkflowsResponse {
  total_count: number;
  workflows: Workflow[];
}

export interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

export async function listRepoWorkflows(client: GitHubClient, owner: string, repo: string): Promise<WorkflowsResponse> {
    return await client.get<WorkflowsResponse>(`/repos/${owner}/${repo}/actions/workflows`);
}

export async function listWorkflowRuns(client: GitHubClient, owner: string, repo: string, workflowId: string | number, per_page = 50): Promise<WorkflowRunsResponse> {
    return await client.get<WorkflowRunsResponse>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${per_page}`);
}
export async function listAllRepoActionRuns(client: GitHubClient, owner: string, repo: string): Promise<WorkflowRunsResponse> {
  return client.get<WorkflowRunsResponse>(`/repos/${owner}/${repo}/actions/runs`);
}

/**
 * Get the most recent workflow run for a given workflow.
 * Returns the single latest run object, or null if no runs exist.
 */
export async function getLatestWorkflowRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  workflowId: string | number
): Promise<WorkflowRun | null> {
  const result = await listWorkflowRuns(client, owner, repo, workflowId, 1);
  const runs = result?.workflow_runs;
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return runs[0];
}