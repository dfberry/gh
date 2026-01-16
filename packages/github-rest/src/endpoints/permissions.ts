// Fetch GitHub Actions metadata for a repo
import { createGitHubClient } from '../core/factory.js';
export async function fetchRepoActions(owner: string, repo: string) {
  const client = createGitHubClient();
  return client.get(`/repos/${owner}/${repo}/actions/runs`);
}
import { GitHubClient } from '../core/client.js';
import { getRepo } from './repos.js';
import { getBranchProtection, listCollaborators, listRepoSecrets } from './security.js';

/**
 * Resolve permissions for a repo-like object or by owner/name.
 * Returns `undefined` if permissions cannot be determined.
 */
export async function fetchBranchProtection(owner: string, repo: string, branch: string) {
  return getBranchProtection(owner, repo, branch);
}

export async function fetchCollaborators(owner: string, repo: string) {
  return listCollaborators(owner, repo);
}

export async function fetchRepoSecrets(owner: string, repo: string) {
  return listRepoSecrets(owner, repo);
}
export async function getRepoPermissions(client: GitHubClient, repoLikeOrOwner: any, maybeName?: string): Promise<any | undefined> {
  // If called with (client, repoLike)
  if (maybeName === undefined) {
    const repoLike = repoLikeOrOwner;
    if (!repoLike) return undefined;
    if (repoLike.permissions) return repoLike.permissions;
    const owner = repoLike.owner?.login || repoLike.full_name?.split('/')?.[0];
    const name = repoLike.name || repoLike.full_name?.split('/')?.[1];
    if (!owner || !name) return undefined;
    try {
      const full = await getRepo(client, owner, name);
      return (full as any).permissions;
    } catch {
      return undefined;
    }
  }

  // Called with (client, owner, name)
  const owner = repoLikeOrOwner as string;
  const name = maybeName as string;
  try {
    const full = await getRepo(client, owner, name);
    return (full as any).permissions;
  } catch {
    return undefined;
  }
}

export async function hasAdminPermission(client: GitHubClient, repoLikeOrOwner: any, maybeName?: string): Promise<boolean> {
  const perms = await getRepoPermissions(client, repoLikeOrOwner, maybeName as any);
  return Boolean(perms && perms.admin);
}

export default { getRepoPermissions, hasAdminPermission };
