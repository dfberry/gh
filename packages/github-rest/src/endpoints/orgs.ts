import type { GitHubClient } from '../core/client.js';

/**
 * Returns the list of organizations the authenticated user has access to.
 */
export async function getUserOrganizations(client: GitHubClient) {
  return client.get('/user/orgs');
}