/**
 * Deduplication — checks for existing auto-fix PRs to avoid duplicates.
 */

import type { GitHubClient } from 'github-rest';
import { repos } from 'github-rest';

/**
 * Check if an auto-fix PR already exists for this branch pattern.
 * Returns the PR number if found, null otherwise.
 */
export async function checkForExistingPR(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
): Promise<number | null> {
  try {
    return await repos.findPRByBranch(client, owner, repo, branch);
  } catch (error) {
    // If error, assume no PR exists (fail-safe)
    return null;
  }
}

/**
 * Check if any auto-fix PR exists for this category (by branch prefix).
 * Returns true if any autofix/* PR exists for the category pattern.
 */
export async function hasExistingAutoFixPR(
  client: GitHubClient,
  owner: string,
  repo: string,
  categoryPrefix: string, // e.g., 'autofix/missing-security-files'
): Promise<boolean> {
  try {
    // Search for open PRs with the branch prefix
    const branchPattern = `${owner}:${categoryPrefix}`;
    const pr = await repos.findPRByBranch(client, owner, repo, branchPattern);
    return pr !== null;
  } catch (error) {
    // If error, assume no PR exists
    return false;
  }
}
