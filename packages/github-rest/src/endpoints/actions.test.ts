import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitHubClient } from '../core/client.js';
import { getLatestWorkflowRun } from './actions.js';

function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
    rawRequest: vi.fn(),
  } as unknown as GitHubClient;
}

describe('getLatestWorkflowRun', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();
  });

  it('returns the latest workflow run', async () => {
    const mockRun = {
      id: 12345,
      status: 'completed',
      conclusion: 'success',
      created_at: '2024-06-01T00:00:00Z',
      html_url: 'https://github.com/octocat/hello/actions/runs/12345',
    };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_count: 5,
      workflow_runs: [mockRun],
    });

    const result = await getLatestWorkflowRun(client, 'octocat', 'hello', 'ci.yml');

    expect(result).toEqual(mockRun);
    expect(client.get).toHaveBeenCalledWith(
      '/repos/octocat/hello/actions/workflows/ci.yml/runs?per_page=1'
    );
  });

  it('returns null when no runs exist', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_count: 0,
      workflow_runs: [],
    });

    const result = await getLatestWorkflowRun(client, 'octocat', 'hello', 'ci.yml');

    expect(result).toBeNull();
  });

  it('returns null when workflow_runs is missing', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_count: 0,
    });

    const result = await getLatestWorkflowRun(client, 'octocat', 'hello', 'ci.yml');

    expect(result).toBeNull();
  });

  it('accepts numeric workflow IDs', async () => {
    const mockRun = { id: 99, status: 'completed', conclusion: 'failure' };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      total_count: 1,
      workflow_runs: [mockRun],
    });

    const result = await getLatestWorkflowRun(client, 'octocat', 'hello', 42);

    expect(result).toEqual(mockRun);
    expect(client.get).toHaveBeenCalledWith(
      '/repos/octocat/hello/actions/workflows/42/runs?per_page=1'
    );
  });

  it('propagates API errors', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitHub API error 403')
    );

    await expect(
      getLatestWorkflowRun(client, 'octocat', 'hello', 'ci.yml')
    ).rejects.toThrow('GitHub API error 403');
  });
});
