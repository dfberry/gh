import { getDefaultBranch } from './describe-helpers.js';
import { getBranchProtection } from './security.js';

/**
 * Gets branch protection for the default branch of a repository.
 * @param owner GitHub owner/org
 * @param repo Repository name
 * @returns Branch protection object for the default branch
 */
export async function getDefaultBranchProtection(owner: string, repo: string) {
  const branch = await getDefaultBranch(owner, repo);
  if (!branch) throw new Error('Default branch not found');
  return getBranchProtection(owner, repo, branch);
}
