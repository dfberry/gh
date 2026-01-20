
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

/**
 * Return an array of OAuth scopes granted to the current token.
 *
 * This performs an authenticated `GET /user` request and parses the
 * `X-OAuth-Scopes` response header into a string array. Returns an empty
 * array if no scopes are present or the request fails.
 */
export async function getUserTokenPermissions(client: GitHubClient): Promise<string[]> {
  try {
    const res = await client.rawRequest('GET', '/user');
    const scopesHeader = (res.headers['x-oauth-scopes'] ?? '') as string;
    return scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}
