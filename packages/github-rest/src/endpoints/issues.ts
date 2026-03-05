import type { GitHubClient } from '../core/client.js';

// --- Types ---

export interface GitHubIssue {
  id: number;
  number: number;
  state: string;
  title: string;
  body?: string | null;
  labels: Array<GitHubLabel | string>;
  assignees: Array<{ login: string }>;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  default: boolean;
}

export interface CreateIssueOptions {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
}

export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all';
  labels?: string;
  per_page?: number;
  page?: number;
}

// --- Issue CRUD ---

/**
 * Create an issue in a repository.
 * POST /repos/{owner}/{repo}/issues
 */
export async function createIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[],
  assignees?: string[],
): Promise<GitHubIssue> {
  const payload: CreateIssueOptions = { title };
  if (body !== undefined) payload.body = body;
  if (labels !== undefined) payload.labels = labels;
  if (assignees !== undefined) payload.assignees = assignees;
  return client.post<GitHubIssue>(`/repos/${owner}/${repo}/issues`, payload);
}

/**
 * List issues for a repository.
 * GET /repos/{owner}/{repo}/issues
 */
export async function listIssues(
  client: GitHubClient,
  owner: string,
  repo: string,
  state?: 'open' | 'closed' | 'all',
  labels?: string,
  per_page?: number,
  page?: number,
): Promise<GitHubIssue[]> {
  const params: Record<string, string | number> = {};
  if (state) params.state = state;
  if (labels) params.labels = labels;
  if (per_page !== undefined) params.per_page = per_page;
  if (page !== undefined) params.page = page;
  return client.get<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`, { params });
}

/**
 * Get a single issue by number.
 * GET /repos/{owner}/{repo}/issues/{issue_number}
 */
export async function getIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  issue_number: number,
): Promise<GitHubIssue> {
  return client.get<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issue_number}`);
}

/**
 * Update an existing issue.
 * PATCH /repos/{owner}/{repo}/issues/{issue_number}
 */
export async function updateIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  issue_number: number,
  updates: UpdateIssueOptions,
): Promise<GitHubIssue> {
  return client.patch<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issue_number}`, updates);
}

// --- Labels ---

/**
 * Add labels to an issue.
 * POST /repos/{owner}/{repo}/issues/{issue_number}/labels
 */
export async function addLabelsToIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  issue_number: number,
  labels: string[],
): Promise<GitHubLabel[]> {
  return client.post<GitHubLabel[]>(
    `/repos/${owner}/${repo}/issues/${issue_number}/labels`,
    { labels },
  );
}

/**
 * Create a label in a repository.
 * POST /repos/{owner}/{repo}/labels
 */
export async function createLabel(
  client: GitHubClient,
  owner: string,
  repo: string,
  name: string,
  color?: string,
  description?: string,
): Promise<GitHubLabel> {
  const payload: Record<string, string> = { name };
  if (color !== undefined) payload.color = color;
  if (description !== undefined) payload.description = description;
  return client.post<GitHubLabel>(`/repos/${owner}/${repo}/labels`, payload);
}

/**
 * List labels for a repository.
 * GET /repos/{owner}/{repo}/labels
 */
export async function listLabels(
  client: GitHubClient,
  owner: string,
  repo: string,
  per_page?: number,
  page?: number,
): Promise<GitHubLabel[]> {
  const params: Record<string, string | number> = {};
  if (per_page !== undefined) params.per_page = per_page;
  if (page !== undefined) params.page = page;
  return client.get<GitHubLabel[]>(`/repos/${owner}/${repo}/labels`, { params });
}
