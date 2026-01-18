import { GitHubClient } from './client.js';
/**
 * Create a configured `GitHubClient` instance.
 */
export function createGitHubClient(opts = {}) {
    return new GitHubClient({ token: opts.token, userAgent: opts.userAgent });
}
