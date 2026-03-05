// Fetch GitHub Actions metadata for a repo
import { GitHubClient } from '../core/client.js';
import { getDefaultBranch, getRepo } from './repos.js';
import { listCollaborators, listRepoSecrets } from './security.js';

export async function getRepoActions(client: GitHubClient, owner: string, repo: string) {
  return client.get(`/repos/${owner}/${repo}/actions/runs`);
}

export async function getDefaultBranchProtection(client: GitHubClient, owner: string, repo: string) {
  const branch = await getDefaultBranch(client, owner, repo);
  if (!branch) throw new Error('Default branch not found');
  return getBranchProtection(client, owner, repo, branch);
}
export async function getBranchProtection(client: GitHubClient, owner: string, repo: string, branch: string) {
  return client.get(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`);
}

export async function getCollaborators(client: GitHubClient, owner: string, repo: string) {
  return listCollaborators(client, owner, repo);
}

export async function getRepoSecrets(client: GitHubClient, owner: string, repo: string) {
  return listRepoSecrets(client, owner, repo);
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
