
import { GitHubClient } from '../core/client.js';

/**
 * Fetch the authenticated user.
 */
export async function getAuthenticatedUser(client: GitHubClient): Promise<any | null> {
    return await client.get<any>('/user');
}

export async function getUserProfile(client: GitHubClient, username: string) {
  return client.get(`/users/${username}`);
}
