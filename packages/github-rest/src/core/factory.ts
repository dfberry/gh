import { GitHubClient } from './client.js';

export type CreateClientOptions = { token?: string; userAgent?: string };

/**
 * Create a configured `GitHubClient` instance.
 */
export function createGitHubClient(opts: CreateClientOptions = {}): GitHubClient {
  return new GitHubClient({ token: opts.token, userAgent: opts.userAgent });
}
