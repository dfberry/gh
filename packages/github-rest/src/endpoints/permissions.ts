import { GitHubClient } from '../core/client.js';
import { getRepo } from './repos.js';

/**
 * Resolve permissions for a repo-like object or by owner/name.
 * Returns `undefined` if permissions cannot be determined.
 */
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
