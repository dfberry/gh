import { getRepoPermissions as grGetRepoPermissions, hasAdminPermission as grHasAdmin } from 'github-rest';

// Deprecated local shim — delegate to `github-rest` implementation.
export async function getRepoPermissions(client: any, repoLike: any) {
  return grGetRepoPermissions(client, repoLike as any);
}

export async function hasAdminPermission(client: any, repoLike: any) {
  return grHasAdmin(client, repoLike as any);
}

export default { getRepoPermissions, hasAdminPermission };
