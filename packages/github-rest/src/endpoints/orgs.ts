import { createGitHubClient } from '../core/factory.js';

/**
 * Returns the list of organizations the authenticated user has access to.
 */
export async function getUserOrganizations() {
  const client = createGitHubClient();
  return client.get('/user/orgs');
}
