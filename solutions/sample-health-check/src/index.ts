/**
 * Sample health check — orchestration layer.
 *
 * Fetches data via github-rest, runs pure checks, scores results.
 * Uses Promise.allSettled for graceful degradation (same as security-audit-repos).
 */

import type { GitHubClient, CommunityProfile, ContentItem, WorkflowsResponse, WorkflowRun } from 'github-rest';
import { repos, actions, alerts, security, contents } from 'github-rest';

import {
  checkReadmeExists,
  checkReadmeQuality,
  checkReadmeSections,
  checkLicenseExists,
  checkContributingExists,
  checkCodeOfConductExists,
  checkGitignoreExists,
  checkDescriptionSet,
  checkTopicsSet,
  checkNotArchived,
  checkDefaultBranchIsMain,
  checkHasWorkflows,
  checkRecentWorkflowSuccess,
  checkNoFailingWorkflows,
  checkLowCriticalDependabot,
  checkLowHighDependabot,
  checkAutomatedSecurityFixes,
  checkRecentCommit,
  checkRecentPush,
  checkManageableIssues,
  checkHasReleases,
  checkBranchProtected,
  checkHasAzureTopic,
  checkHasLanguageTopics,
  checkDescriptionMentionsAzure,
} from './checks.js';

import {
  calculateHealthScore,
  gradeFromScore,
  generateDimensionSummary,
} from './scoring.js';

import type { CheckResult, DimensionSummary } from './scoring.js';

// ─── Local type extensions ───────────────────────────────────────────────────
// These cover fields used by health checks but not yet fully typed in github-rest.

/** Extended repo shape — covers fields from getRepo() used by health checks */
interface RepoData {
  topics?: string[];
  description?: string | null;
  archived?: boolean;
  default_branch?: string;
  pushed_at?: string | null;
  open_issues_count?: number;
}

/** Minimal Dependabot alert shape for severity counting */
interface DependabotAlert {
  security_advisory?: {
    severity?: string;
  };
}

/** Automated security fixes response shape */
interface AutomatedSecurityFixesResponse {
  enabled?: boolean;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type { CheckResult, DimensionSummary } from './scoring.js';
export { HEALTH_WEIGHTS, gradeFromScore, generateDimensionSummary } from './scoring.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface HealthCheckOptions {
  verbose?: boolean;
}

/** An error encountered during pipeline execution. */
export interface PipelineError {
  repo: string;
  category: 'auth' | 'not_found' | 'rate_limit' | 'api_error' | 'unknown';
  message: string;
  suggestion: string;
}

export interface RepoHealthCheck {
  owner: string;
  repo: string;
  checkedAt: string;
  score: number;
  grade: string;
  checks: CheckResult[];
  dimensions: Record<string, DimensionSummary>;
}

export interface HealthCheckReport {
  repos: RepoHealthCheck[];
  errors?: PipelineError[];
  summary: {
    totalRepos: number;
    avgScore: number;
    avgGrade: string;
    gradeDistribution: Record<string, number>;
    worstDimension: string;
    timestamp: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a failed check for when the data source is unavailable. */
function failedCheck(
  dimension: string,
  signal: string,
  weight: number,
  detail: string,
): CheckResult {
  return { dimension, signal, passed: false, weight, earned: 0, detail };
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Check health of a single repository.
 * Fetches all data via Promise.allSettled, then runs 25 checks and scores.
 */
export async function checkRepoHealth(
  client: GitHubClient,
  owner: string,
  repo: string,
  options?: HealthCheckOptions,
): Promise<RepoHealthCheck> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`  Checking health of ${owner}/${repo}...`);
  }

  // Determine default branch (needed for branch protection check)
  let defaultBranch = 'main';
  try {
    defaultBranch = await repos.getDefaultBranch(client, owner, repo) ?? 'main';
  } catch {
    if (verbose) console.log(`    ⚠ Could not determine default branch, using 'main'`);
  }

  // Fetch all data in parallel — graceful degradation via allSettled
  const [
    repoDataResult,
    communityProfileResult,
    readmeResult,
    metadataResult,
    releasesResult,
    rootContentsResult,
    workflowsResult,
    dependabotResult,
    branchProtectionResult,
    autoFixResult,
  ] = await Promise.allSettled([
    repos.getRepo(client, owner, repo),
    repos.getCommunityProfile(client, owner, repo),
    repos.getRepoReadme(client, owner, repo),
    repos.fetchRepoMetadata(client, owner, repo),
    repos.listReleases(client, owner, repo),
    contents.getRootContents(client, owner, repo),
    actions.listRepoWorkflows(client, owner, repo),
    alerts.listDependabotAlerts(client, owner, repo),
    security.getBranchProtection(client, owner, repo, defaultBranch),
    security.getAutomatedSecurityFixes(client, owner, repo),
  ]);

  // Extract results with safe defaults
  const repoAvailable = repoDataResult.status === 'fulfilled';
  const repoData = repoAvailable ? repoDataResult.value as RepoData : null;

  const communityProfile = communityProfileResult.status === 'fulfilled'
    ? communityProfileResult.value as CommunityProfile
    : null;

  const readme = readmeResult.status === 'fulfilled'
    ? readmeResult.value as string | null
    : null;

  const metadata = metadataResult.status === 'fulfilled'
    ? metadataResult.value
    : null;

  const releases = releasesResult.status === 'fulfilled'
    ? (Array.isArray(releasesResult.value) ? releasesResult.value : [])
    : [];

  const rootContents = rootContentsResult.status === 'fulfilled'
    ? (Array.isArray(rootContentsResult.value)
      ? rootContentsResult.value.map((f: ContentItem) => f.name)
      : [])
    : [];

  const workflowsAvailable = workflowsResult.status === 'fulfilled';
  const workflowsData = workflowsAvailable
    ? workflowsResult.value as WorkflowsResponse
    : null;

  const dependabotAvailable = dependabotResult.status === 'fulfilled';
  const dependabotAlerts = dependabotAvailable
    ? (Array.isArray(dependabotResult.value) ? dependabotResult.value as DependabotAlert[] : [])
    : [];

  const branchProtection = branchProtectionResult.status === 'fulfilled'
    ? branchProtectionResult.value
    : null;

  const autoFixData = autoFixResult.status === 'fulfilled'
    ? autoFixResult.value as AutomatedSecurityFixesResponse
    : null;

  // Extract workflow info and fetch latest runs (Kaylee's getLatestWorkflowRun)
  const workflows = workflowsData?.workflows ?? [];
  const workflowCount = workflows.length;

  let bestConclusion: string | null = null;
  let failingCount = 0;

  for (const wf of workflows.slice(0, 10)) {
    try {
      const run = await actions.getLatestWorkflowRun(client, owner, repo, wf.id);
      if (run) {
        const conclusion = run.conclusion ?? null;
        if (conclusion === 'success') bestConclusion = 'success';
        if (conclusion === 'failure') failingCount++;
        if (bestConclusion === null) bestConclusion = conclusion;
      }
    } catch {
      // Skip workflows with no runs
    }
  }

  // Count dependabot alert severities
  let criticalDependabot = 0;
  let highDependabot = 0;
  for (const alert of dependabotAlerts) {
    const severity = alert.security_advisory?.severity?.toLowerCase();
    if (severity === 'critical') criticalDependabot++;
    else if (severity === 'high') highDependabot++;
  }

  // Derive community file presence from profile + root listing
  const licenseExists =
    communityProfile?.files?.license != null ||
    rootContents.some((f: string) => /^LICENSE(\.md)?$/i.test(f));
  const contributingExists =
    communityProfile?.files?.contributing != null ||
    rootContents.some((f: string) => /^CONTRIBUTING(\.md)?$/i.test(f));
  const codeOfConductExists =
    communityProfile?.files?.code_of_conduct != null ||
    rootContents.some((f: string) => /^CODE_OF_CONDUCT(\.md)?$/i.test(f));
  const gitignoreExists = rootContents.some((f: string) => f === '.gitignore');
  const topics: string[] = repoData?.topics ?? [];

  // ─── Run all 25 checks ────────────────────────────────────────────────────

  const checks: CheckResult[] = [];

  // Documentation Quality (6 checks)
  checks.push(checkReadmeExists(readme));
  checks.push(checkReadmeQuality(readme));
  checks.push(checkReadmeSections(readme));
  checks.push(checkLicenseExists(licenseExists));
  checks.push(checkContributingExists(contributingExists));
  checks.push(checkCodeOfConductExists(codeOfConductExists));

  // Repository Hygiene (5 checks)
  checks.push(checkGitignoreExists(gitignoreExists));
  checks.push(checkDescriptionSet(repoData?.description ?? null));
  checks.push(checkTopicsSet(topics));
  // Guard: when repoData unavailable, don't award points for "not archived" or "main branch"
  checks.push(
    repoAvailable
      ? checkNotArchived(repoData?.archived ?? false)
      : failedCheck('hygiene', 'not_archived', 2, 'Repo data unavailable'),
  );
  checks.push(
    repoAvailable
      ? checkDefaultBranchIsMain(repoData?.default_branch ?? defaultBranch)
      : failedCheck('hygiene', 'default_branch_main', 1, 'Repo data unavailable'),
  );

  // CI/CD Presence (3 checks)
  checks.push(checkHasWorkflows(workflowCount));
  checks.push(checkRecentWorkflowSuccess(bestConclusion));
  checks.push(
    workflowsAvailable
      ? checkNoFailingWorkflows(failingCount)
      : failedCheck('ci_cd', 'no_failing_workflows', 5, 'Workflow data unavailable'),
  );

  // Dependency Freshness (3 checks)
  checks.push(
    dependabotAvailable
      ? checkLowCriticalDependabot(criticalDependabot)
      : failedCheck('dependency_freshness', 'low_critical_dependabot', 8, 'Dependabot data unavailable'),
  );
  checks.push(
    dependabotAvailable
      ? checkLowHighDependabot(highDependabot)
      : failedCheck('dependency_freshness', 'low_high_dependabot', 5, 'Dependabot data unavailable'),
  );
  checks.push(checkAutomatedSecurityFixes(autoFixData?.enabled ?? false));

  // Activity & Maintenance (4 checks)
  checks.push(checkRecentCommit(metadata?.lastCommitDate ?? null));
  checks.push(checkRecentPush(repoData?.pushed_at ?? null));
  checks.push(
    repoAvailable
      ? checkManageableIssues(repoData?.open_issues_count ?? 0)
      : failedCheck('activity', 'manageable_issues', 3, 'Repo data unavailable'),
  );
  checks.push(checkHasReleases(releases.length));

  // Branch Protection (1 check)
  checks.push(checkBranchProtected(branchProtection !== null && branchProtection !== undefined));

  // Azure Sample-Specific (3 checks)
  checks.push(checkHasAzureTopic(topics));
  checks.push(checkHasLanguageTopics(topics));
  checks.push(checkDescriptionMentionsAzure(repoData?.description ?? null));

  // Score
  const { score, grade } = calculateHealthScore(checks);
  const dimensions = generateDimensionSummary(checks);

  if (verbose) {
    console.log(`    ✓ Score: ${score}/100 (${grade}) | ${checks.filter((c) => c.passed).length}/${checks.length} checks passed`);
  }

  return {
    owner,
    repo,
    checkedAt: new Date().toISOString(),
    score,
    grade,
    checks,
    dimensions,
  };
}

/** Categorize a caught error into a structured PipelineError. */
function categorizePipelineError(repo: string, error: unknown): PipelineError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401')) {
    return { repo, category: 'auth', message: 'GitHub API error 401', suggestion: 'Check your GITHUB_TOKEN in .env — it may be expired or missing.' };
  }
  if (message.includes('403') || message.toLowerCase().includes('rate limit')) {
    return { repo, category: 'rate_limit', message: message.toLowerCase().includes('rate limit') ? 'GitHub API rate limit exceeded' : 'GitHub API error 403', suggestion: 'GitHub API rate limit exceeded. Wait a few minutes or use a token with higher limits.' };
  }
  if (message.includes('404') || message.includes('Not Found')) {
    return { repo, category: 'not_found', message: 'Repository not found (404)', suggestion: 'Verify the repo exists and you have access.' };
  }
  return { repo, category: 'api_error', message, suggestion: 'Check the error message for details and verify your GitHub token has the required permissions.' };
}

/**
 * Check health of multiple repositories.
 * Runs sequentially for rate-limit safety.
 */
export async function checkReposHealth(
  client: GitHubClient,
  repoList: string[],
  options?: HealthCheckOptions,
): Promise<HealthCheckReport> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`\nChecking health of ${repoList.length} repositories...`);
  }

  const results: RepoHealthCheck[] = [];
  const errors: PipelineError[] = [];

  for (const repoFullName of repoList) {
    const [owner, repo] = repoFullName.split('/');

    if (!owner || !repo) {
      if (verbose) console.log(`  ⚠ Skipping invalid repo name: ${repoFullName}`);
      continue;
    }

    try {
      const result = await checkRepoHealth(client, owner, repo, options);
      results.push(result);
    } catch (error) {
      if (verbose) {
        console.log(`  ✗ Failed to check ${owner}/${repo}: ${(error as Error).message}`);
      }
      errors.push(categorizePipelineError(repoFullName, error));
    }
  }

  // Summary statistics
  const totalRepos = results.length;
  const avgScore = totalRepos > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / totalRepos * 100) / 100
    : 0;
  const avgGrade = gradeFromScore(avgScore);

  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of results) {
    gradeDistribution[r.grade] = (gradeDistribution[r.grade] ?? 0) + 1;
  }

  // Identify worst dimension by average pass rate
  const dimAccum: Record<string, { totalRate: number; count: number }> = {};
  for (const r of results) {
    for (const [dim, summary] of Object.entries(r.dimensions)) {
      if (!dimAccum[dim]) dimAccum[dim] = { totalRate: 0, count: 0 };
      dimAccum[dim].totalRate += summary.passRate;
      dimAccum[dim].count += 1;
    }
  }
  let worstDimension = 'N/A';
  let worstRate = Infinity;
  for (const [dim, data] of Object.entries(dimAccum)) {
    const avg = data.count > 0 ? data.totalRate / data.count : 0;
    if (avg < worstRate) {
      worstRate = avg;
      worstDimension = dim;
    }
  }

  return {
    repos: results,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      totalRepos,
      avgScore,
      avgGrade,
      gradeDistribution,
      worstDimension,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Markdown Report ─────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  documentation: 'Documentation Quality',
  hygiene: 'Repository Hygiene',
  ci_cd: 'CI/CD Presence',
  dependency_freshness: 'Dependency Freshness',
  activity: 'Activity & Maintenance',
  branch_protection: 'Branch Protection',
  azure: 'Azure Sample-Specific',
};

/** Generate human-readable markdown from a health check report. */
export function generateHealthSummary(report: HealthCheckReport): string {
  const { summary, repos: repoResults } = report;

  let output = '# Sample Health Check Report\n\n';
  output += `**Generated:** ${summary.timestamp}\n\n`;

  output += '## Summary\n\n';
  output += `- **Total Repositories:** ${summary.totalRepos}\n`;
  output += `- **Average Health Score:** ${summary.avgScore}/100 (${summary.avgGrade})\n`;
  output += `- **Grade Distribution:** ${Object.entries(summary.gradeDistribution).map(([g, n]) => `${g}: ${n}`).join(', ')}\n`;
  output += `- **Weakest Area:** ${DIMENSION_LABELS[summary.worstDimension] ?? summary.worstDimension}\n\n`;

  output += '## Repository Details\n\n';

  // Sort by score ascending (needs attention first)
  const sorted = [...repoResults].sort((a, b) => a.score - b.score);

  for (const r of sorted) {
    output += `### ${r.owner}/${r.repo} (Score: ${r.score}/100 — ${r.grade})\n\n`;
    output += '| Dimension | Earned | Possible | Pass Rate |\n';
    output += '|-----------|--------|----------|----------|\n';

    for (const [dim, info] of Object.entries(r.dimensions)) {
      const label = DIMENSION_LABELS[dim] ?? dim;
      const emoji = info.passRate >= 0.8 ? '✅' : info.passRate >= 0.5 ? '⚠️' : '❌';
      output += `| ${label} | ${info.earned} | ${info.possible} | ${Math.round(info.passRate * 100)}% ${emoji} |\n`;
    }
    output += '\n';

    const failing = r.checks.filter((c) => !c.passed);
    if (failing.length > 0) {
      output += '**Failing Checks:**\n';
      for (const check of failing) {
        output += `- ⚠️ ${check.detail ?? check.signal}\n`;
      }
      output += '\n';
    }

    output += '---\n\n';
  }

  return output;
}
