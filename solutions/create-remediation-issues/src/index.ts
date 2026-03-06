/**
 * create-remediation-issues — Analyze security & health reports, create GitHub issues.
 *
 * Composes github-rest issues API into an end-to-end remediation pipeline:
 *   SecurityAuditReport / HealthCheckReport → findings → deduplicate → GitHub Issues
 */

import type { GitHubClient } from 'github-rest';
import { issues } from 'github-rest';

export type {
  SecurityAuditReport,
  RepoSecurityAudit,
  HealthCheckReport,
  RepoHealthCheck,
  RemediationIssue,
  RemediationOptions,
  RemediationInput,
  RemediationResult,
  CreatedIssue,
  SkippedIssue,
  PipelineError,
} from './types.js';

import type {
  SecurityAuditReport,
  HealthCheckReport,
  RemediationIssue,
  RemediationOptions,
  RemediationInput,
  RemediationResult,
  SkippedIssue,
  CreatedIssue,
  PipelineError,
} from './types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default security score threshold — repos below this get issues. */
export const DEFAULT_SECURITY_SCORE_THRESHOLD = 70;

/** Default health grade threshold — repos at this grade or worse get issues. */
export const DEFAULT_HEALTH_GRADE_THRESHOLD = 'D';

/** Label applied to all remediation issues. */
export const REMEDIATION_LABEL = 'automated-remediation';

/** Label for security-sourced issues. */
export const SECURITY_LABEL = 'security';

/** Label for health-sourced issues. */
export const HEALTH_LABEL = 'health';

const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

const FINDING_DESCRIPTIONS: Record<string, string> = {
  'critical-dependabot': 'Critical Dependabot vulnerabilities',
  'high-dependabot': 'High Dependabot alerts',
  'code-scanning': 'Code scanning alerts',
  'secret-scanning': 'Secret scanning alerts',
  'no-branch-protection': 'Default branch unprotected',
  'no-automated-security-fixes': 'Automated security fixes disabled',
  'low-security-score': 'Low security score',
  'low-health-grade': 'Low health grade',
};

// ─── Formatting Helpers ──────────────────────────────────────────────────────

/**
 * Format the title for a remediation issue.
 * Pattern: `[{source}] {owner}/{repo}: {description}`
 */
export function formatIssueTitle(
  source: 'security' | 'health',
  owner: string,
  repo: string,
  findingType: string,
  detail?: string,
): string {
  const tag = source === 'security' ? 'Security' : 'Health';
  const description =
    FINDING_DESCRIPTIONS[findingType] ??
    findingType.replace(/^failing-dimension-/, '').replace(/-/g, ' ');

  if (detail) {
    return `[${tag}] ${owner}/${repo}: ${description} — ${detail}`;
  }
  return `[${tag}] ${owner}/${repo}: ${description}`;
}

/**
 * Format the body for a remediation issue with relevant details.
 */
export function formatIssueBody(
  issue: RemediationIssue,
  context?: Record<string, unknown>,
): string {
  const lines: string[] = [
    `## Remediation Required`,
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Repository** | [${issue.owner}/${issue.repo}](https://github.com/${issue.owner}/${issue.repo}) |`,
    `| **Source** | ${issue.source} audit |`,
    `| **Severity** | ${issue.severity} |`,
    `| **Finding** | \`${issue.findingType}\` |`,
  ];

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      lines.push(`| **${key}** | ${value} |`);
    }
  }

  lines.push('', '---', '');
  lines.push(`> 🤖 This issue was created automatically by \`create-remediation-issues\`.`);

  return lines.join('\n');
}

// ─── Analysis Functions ──────────────────────────────────────────────────────

function buildIssue(
  owner: string,
  repo: string,
  source: 'security' | 'health',
  findingType: string,
  severity: RemediationIssue['severity'],
  context: Record<string, unknown>,
  extraLabels?: string[],
): RemediationIssue {
  const title = formatIssueTitle(source, owner, repo, findingType);
  const stub: RemediationIssue = {
    owner,
    repo,
    title,
    body: '',
    labels: [
      REMEDIATION_LABEL,
      source === 'security' ? SECURITY_LABEL : HEALTH_LABEL,
      ...(extraLabels ?? []),
    ],
    source,
    findingType,
    severity,
  };
  stub.body = formatIssueBody(stub, context);
  return stub;
}

/**
 * Analyze a security audit report and return issues that should be created.
 *
 * Signal-based findings (dependabot, code scanning, etc.) fire for every repo.
 * Score-based findings only fire for repos below the score threshold.
 */
export function analyzeSecurityFindings(
  report: SecurityAuditReport,
  options?: RemediationOptions,
): RemediationIssue[] {
  const threshold = options?.securityScoreThreshold ?? DEFAULT_SECURITY_SCORE_THRESHOLD;
  const verbose = options?.verbose ?? false;
  const result: RemediationIssue[] = [];

  if (verbose) {
    console.log(`  Analyzing security report: ${report.repos.length} repos...`);
  }

  for (const repo of report.repos) {
    const { owner, repo: repoName } = repo;
    let hasFindings = false;

    // Signal-based findings — always checked
    if (repo.dependabotAlerts.critical > 0) {
      result.push(
        buildIssue(owner, repoName, 'security', 'critical-dependabot', 'critical', {
          alertCount: repo.dependabotAlerts.critical,
          totalAlerts: repo.dependabotAlerts.total,
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (repo.dependabotAlerts.high >= 3) {
      result.push(
        buildIssue(owner, repoName, 'security', 'high-dependabot', 'high', {
          alertCount: repo.dependabotAlerts.high,
          totalAlerts: repo.dependabotAlerts.total,
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (repo.codeScanningAlerts.enabled && repo.codeScanningAlerts.total > 0) {
      result.push(
        buildIssue(owner, repoName, 'security', 'code-scanning', 'high', {
          alertCount: repo.codeScanningAlerts.total,
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (repo.secretScanningAlerts.total > 0) {
      result.push(
        buildIssue(owner, repoName, 'security', 'secret-scanning', 'critical', {
          alertCount: repo.secretScanningAlerts.total,
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (!repo.branchProtection.protected) {
      result.push(
        buildIssue(owner, repoName, 'security', 'no-branch-protection', 'medium', {
          defaultBranch: repo.branchProtection.defaultBranch,
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (!repo.automatedSecurityFixes.enabled) {
      result.push(
        buildIssue(owner, repoName, 'security', 'no-automated-security-fixes', 'low', {
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    // Score-based finding — only for repos below threshold
    if (repo.score < threshold && !hasFindings) {
      const severity = repo.score < 50 ? 'high' : 'medium';
      result.push(
        buildIssue(owner, repoName, 'security', 'low-security-score', severity as RemediationIssue['severity'], {
          score: repo.score,
        }),
      );
      hasFindings = true;
    }

    if (verbose && hasFindings) {
      const repoFindings = result.filter((iss) => iss.owner === owner && iss.repo === repoName);
      const findingTypes = repoFindings.map((iss) => iss.findingType).join(', ');
      console.log(`    ${owner}/${repoName}: ${repoFindings.length} findings (${findingTypes})`);
    }
  }

  return result;
}

/**
 * Analyze a health check report and return issues that should be created.
 */
export function analyzeHealthFindings(
  report: HealthCheckReport,
  options?: RemediationOptions,
): RemediationIssue[] {
  const thresholdGrade = options?.healthGradeThreshold ?? DEFAULT_HEALTH_GRADE_THRESHOLD;
  const verbose = options?.verbose ?? false;
  const result: RemediationIssue[] = [];

  if (verbose) {
    console.log(`  Analyzing health report: ${report.repos.length} repos...`);
  }

  for (const repo of report.repos) {
    const gradeRank = GRADE_ORDER[repo.grade] ?? 0;
    const thresholdRank = GRADE_ORDER[thresholdGrade] ?? GRADE_ORDER['D'];

    if (gradeRank > thresholdRank) continue;

    const { owner, repo: repoName } = repo;
    let repoIssueCount = 0;

    // Overall health grade issue
    result.push(
      buildIssue(owner, repoName, 'health', 'low-health-grade', 'high', {
        score: repo.score,
        grade: repo.grade,
      }),
    );
    repoIssueCount++;

    // Per-dimension issues for failing dimensions
    if (repo.dimensions) {
      for (const [dimension, summary] of Object.entries(repo.dimensions)) {
        if (summary.passRate < 0.5) {
          const severity = summary.earned === 0 ? 'high' : 'medium';
          result.push(
            buildIssue(
              owner,
              repoName,
              'health',
              `failing-dimension-${dimension}`,
              severity as RemediationIssue['severity'],
              {
                dimension,
                earned: summary.earned,
                possible: summary.possible,
                passRate: summary.passRate,
              },
            ),
          );
          repoIssueCount++;
        }
      }
    }

    if (verbose && repoIssueCount > 0) {
      const repoFindings = result.filter((iss) => iss.owner === owner && iss.repo === repoName);
      const findingTypes = repoFindings.map((iss) => iss.findingType.replace('failing-dimension-', '')).join(', ');
      console.log(`    ${owner}/${repoName}: ${repoIssueCount} findings (${findingTypes})`);
    }
  }

  return result;
}

// ─── Error Categorization ────────────────────────────────────────────────────

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

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Filter out issues that already have an open match in the repository.
 * Matches by exact title. Closed issues are not considered duplicates.
 */
export async function deduplicateIssues(
  client: GitHubClient,
  planned: RemediationIssue[],
  options?: RemediationOptions,
): Promise<{ toCreate: RemediationIssue[]; toSkip: SkippedIssue[]; errors: PipelineError[] }> {
  const verbose = options?.verbose ?? false;
  const toCreate: RemediationIssue[] = [];
  const toSkip: SkippedIssue[] = [];
  const errors: PipelineError[] = [];

  // Group by owner/repo for efficient API calls
  const byRepo = new Map<string, RemediationIssue[]>();
  for (const issue of planned) {
    const key = `${issue.owner}/${issue.repo}`;
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key)!.push(issue);
  }

  for (const [, repoIssues] of byRepo) {
    const { owner, repo } = repoIssues[0];
    let existingIssues: Array<{ title: string; number: number; state: string }> = [];

    try {
      existingIssues = await issues.listIssues(
        client, owner, repo, 'open', REMEDIATION_LABEL, 100, 1,
      ) as Array<{ title: string; number: number; state: string }>;
    } catch (error) {
      // On API error, treat as no duplicates — create anyway
      errors.push(categorizePipelineError(`${owner}/${repo}`, error));
      toCreate.push(...repoIssues);
      continue;
    }

    const openTitles = existingIssues
      .filter(i => i.state === 'open')
      .map(i => ({ title: i.title, number: i.number }));

    for (const issue of repoIssues) {
      const match = openTitles.find(e => e.title === issue.title);
      if (match) {
        toSkip.push({
          ...issue,
          reason: 'duplicate — existing open issue',
          existingIssueNumber: match.number,
        });
      } else {
        toCreate.push(issue);
      }
    }
  }

  if (verbose) {
    console.log(`  Deduplication: ${toCreate.length} to create, ${toSkip.length} duplicates skipped`);
  }

  return { toCreate, toSkip, errors };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Main entry point: analyze reports → deduplicate → create issues (or dry-run).
 */
export async function createRemediationIssues(
  client: GitHubClient,
  input: RemediationInput,
  options?: RemediationOptions,
): Promise<RemediationResult> {
  const verbose = options?.verbose ?? false;
  const allPlanned: RemediationIssue[] = [];

  if (input.securityReport) {
    allPlanned.push(...analyzeSecurityFindings(input.securityReport, options));
  }
  if (input.healthReport) {
    allPlanned.push(...analyzeHealthFindings(input.healthReport, options));
  }

  // Apply extra labels to all planned issues
  if (options?.extraLabels?.length) {
    for (const issue of allPlanned) {
      issue.labels.push(...options.extraLabels);
    }
  }

  // Deduplicate against existing open issues
  const { toCreate, toSkip, errors: dedupErrors } = await deduplicateIssues(client, allPlanned, options);

  if (options?.dryRun) {
    if (verbose) {
      console.log(`  Dry run: ${toCreate.length} issues would be created`);
    }
    return {
      created: [],
      skipped: toSkip,
      planned: toCreate,
      dryRun: true,
      errors: dedupErrors.length > 0 ? dedupErrors : undefined,
      summary: {
        totalPlanned: toCreate.length + toSkip.length,
        totalCreated: 0,
        totalSkipped: toSkip.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Create issues via GitHub API
  const created: CreatedIssue[] = [];
  const createErrors: PipelineError[] = [];
  for (const issue of toCreate) {
    try {
      const result = await issues.createIssue(
        client, issue.owner, issue.repo,
        issue.title, issue.body, issue.labels,
      );
      created.push({
        ...issue,
        issueNumber: (result as { number: number }).number,
        issueUrl: (result as { html_url: string }).html_url,
      });
    } catch (error) {
      createErrors.push(categorizePipelineError(`${issue.owner}/${issue.repo}`, error));
    }
  }

  if (verbose) {
    console.log(`  Created ${created.length} issues, skipped ${toSkip.length} duplicates`);
  }

  const allErrors = [...dedupErrors, ...createErrors];
  return {
    created,
    skipped: toSkip,
    planned: [],
    dryRun: false,
    errors: allErrors.length > 0 ? allErrors : undefined,
    summary: {
      totalPlanned: allPlanned.length,
      totalCreated: created.length,
      totalSkipped: toSkip.length,
      timestamp: new Date().toISOString(),
    },
  };
}
