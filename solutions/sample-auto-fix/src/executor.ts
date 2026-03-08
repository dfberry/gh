/**
 * Executor — applies fix plans by creating branches, writing files, and opening PRs.
 */

import type { GitHubClient } from 'github-rest';
import { git, contents, repos } from 'github-rest';
import type { FixPlan, CreatedFix, SkippedFix, FixError } from './types.js';
import { checkForExistingPR } from './dedup.js';

export interface ExecutionResult {
  created: CreatedFix[];
  skipped: SkippedFix[];
  errors: FixError[];
}

/**
 * Execute fix plans with safety checks.
 */
export async function executeFixPlans(
  client: GitHubClient,
  plans: FixPlan[],
  dryRun: boolean,
  verbose: boolean,
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // Preflight: check rate limit
  if (!dryRun) {
    const rateLimitOk = await checkRateLimit(client, verbose);
    if (!rateLimitOk) {
      throw new Error('Rate limit too low (< 100 remaining). Aborting to prevent rate limit exhaustion.');
    }
  }

  // Execute plans sequentially (per-repo safety)
  for (const plan of plans) {
    if (verbose) {
      console.log(`\n[${plan.owner}/${plan.repo}] Processing ${plan.category}...`);
    }

    try {
      const outcome = await executeSinglePlan(client, plan, dryRun, verbose);
      
      if (outcome.type === 'created') {
        result.created.push(outcome.fix);
      } else if (outcome.type === 'skipped') {
        result.skipped.push(outcome.skip);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({
        repo: `${plan.owner}/${plan.repo}`,
        category: plan.category,
        message,
        suggestion: suggestFix(message),
      });
      
      if (verbose) {
        console.error(`  ❌ Error: ${message}`);
      }
    }
  }

  return result;
}

type ExecutionOutcome =
  | { type: 'created'; fix: CreatedFix }
  | { type: 'skipped'; skip: SkippedFix };

/**
 * Execute a single fix plan.
 */
async function executeSinglePlan(
  client: GitHubClient,
  plan: FixPlan,
  dryRun: boolean,
  verbose: boolean,
): Promise<ExecutionOutcome> {
  const repoKey = `${plan.owner}/${plan.repo}`;

  // Step 1: Check if repo is a fork
  if (!dryRun) {
    const repoInfo = await repos.getRepo(client, plan.owner, plan.repo);
    if (repoInfo.fork) {
      if (verbose) {
        console.log(`  ⏭️  Skipping fork`);
      }
      return {
        type: 'skipped',
        skip: {
          repo: repoKey,
          category: plan.category,
          reason: 'Repository is a fork',
        },
      };
    }
  }

  // Step 2: Check for existing PR
  if (!dryRun) {
    const existingPR = await checkForExistingPR(client, plan.owner, plan.repo, plan.branch);
    if (existingPR) {
      if (verbose) {
        console.log(`  ⏭️  Skipping (PR #${existingPR} already exists)`);
      }
      return {
        type: 'skipped',
        skip: {
          repo: repoKey,
          category: plan.category,
          reason: `Pull request #${existingPR} already exists for this fix`,
        },
      };
    }
  }

  if (dryRun) {
    if (verbose) {
      console.log(`  🔍 [DRY-RUN] Would create branch: ${plan.branch}`);
      console.log(`  🔍 [DRY-RUN] Would write ${plan.templates.length} files`);
      console.log(`  🔍 [DRY-RUN] Would create PR: ${plan.prTitle}`);
    }

    return {
      type: 'created',
      fix: {
        repo: repoKey,
        prNumber: 0,
        prUrl: `https://github.com/${plan.owner}/${plan.repo}/pull/0`,
        branch: plan.branch,
        category: plan.category,
        filesModified: plan.templates.map(t => t.path),
      },
    };
  }

  // Step 3: Get default branch SHA
  const defaultSHA = await repos.getDefaultBranchSHA(client, plan.owner, plan.repo);
  if (verbose) {
    console.log(`  📌 Default branch SHA: ${defaultSHA.slice(0, 7)}`);
  }

  // Step 4: Create branch
  const branchRef = `refs/heads/${plan.branch}`;
  await git.createRef(client, plan.owner, plan.repo, branchRef, defaultSHA);
  if (verbose) {
    console.log(`  🌿 Created branch: ${plan.branch}`);
  }

  // Step 5: Write files to branch
  const filesModified: string[] = [];
  for (const template of plan.templates) {
    const encodedContent = contents.encodeContent(template.content);
    await contents.createOrUpdateFile(client, plan.owner, plan.repo, template.path, {
      message: template.commitMessage,
      content: encodedContent,
      branch: plan.branch,
    });
    filesModified.push(template.path);
    if (verbose) {
      console.log(`  📝 Wrote: ${template.path}`);
    }
  }

  // Step 6: Create PR
  const pr = await repos.createPullRequest(client, plan.owner, plan.repo, {
    title: plan.prTitle,
    body: plan.prBody,
    head: plan.branch,
    base: 'main', // Assuming main is the default branch
  });

  if (verbose) {
    console.log(`  ✅ Created PR #${pr.number}: ${pr.html_url}`);
  }

  return {
    type: 'created',
    fix: {
      repo: repoKey,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branch: plan.branch,
      category: plan.category,
      filesModified,
    },
  };
}

/**
 * Check rate limit before executing operations.
 */
async function checkRateLimit(client: GitHubClient, verbose: boolean): Promise<boolean> {
  try {
    const limit = await client.getRateLimit();
    if (!limit) {
      if (verbose) {
        console.warn('⚠️  Could not check rate limit, proceeding...');
      }
      return true;
    }
    
    const remaining = limit.remaining;
    
    if (verbose) {
      console.log(`\n⚡ Rate limit: ${remaining} requests remaining`);
    }

    return remaining >= 100;
  } catch (error) {
    // If we can't check rate limit, proceed with caution
    if (verbose) {
      console.warn('⚠️  Could not check rate limit, proceeding...');
    }
    return true;
  }
}

/**
 * Suggest fixes for common errors.
 */
function suggestFix(errorMessage: string): string | undefined {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('not found') || lower.includes('404')) {
    return 'Verify that the repository exists and you have access to it';
  }

  if (lower.includes('forbidden') || lower.includes('403')) {
    return 'Check that your GitHub token has the required permissions (repo scope)';
  }

  if (lower.includes('rate limit')) {
    return 'Wait for rate limit to reset or use a different token';
  }

  if (lower.includes('reference already exists')) {
    return 'A branch with this name already exists. Delete it or use a different branch name.';
  }

  if (lower.includes('sha required')) {
    return 'File already exists. Use update mode with the file SHA.';
  }

  return undefined;
}
