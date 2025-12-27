import { GitHubClient } from './client.js';

export type ActorWithScopes = { login: string; scopes: string[]; missing: string[] };

/**
 * Fetch the authenticated user login and the token scopes. Returns missing required scopes.
 */
export async function getActorWithScopeCheck(client: GitHubClient, requiredScopes: string[] = ['repo', 'delete_repo']): Promise<ActorWithScopes> {
  const u = await client.getAuthenticatedUser<{ login: string }>();
  const scopes = await client.getTokenScopes();
  const missing = requiredScopes.filter((s) => !scopes.includes(s));
  return { login: (u as any).login, scopes, missing };
}

export default { getActorWithScopeCheck };
