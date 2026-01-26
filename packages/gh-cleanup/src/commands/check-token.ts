
import * as process from 'process';
import { createGitHubClient } from 'github-rest';

/**
 * Checks the current GitHub token and reports on its presence and permissions (scopes).
 * Returns an object with token status, authenticated user, and scopes if available.
 */
export async function checkTokenStatus() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    return { status: 'missing', message: 'No GitHub token found in GH_TOKEN or GITHUB_TOKEN.' };
  }
  try {
    const client = createGitHubClient();
    const user = await client.get('/user');
    let scopes: string[] = [];
    let orgs: any[] = [];
    try {
      scopes = await client.getTokenScopes();
    } catch (scopeErr) {
      // If we can't get scopes, leave as empty array
    }
    try {
      const { getUserOrganizations } = await import('github-rest');
      orgs = await getUserOrganizations() as any[];
    } catch (orgErr) {
      // If we can't get orgs, leave as empty array
    }
    return { status: 'ok', user, scopes, orgs };
  } catch (err: any) {
    return { status: 'invalid', message: err?.message || String(err), error: err };
  }
}
