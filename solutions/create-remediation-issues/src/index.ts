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
  const result: RemediationIssue[] = [];

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
  const result: RemediationIssue[] = [];

  for (const repo of report.repos) {
    const gradeRank = GRADE_ORDER[repo.grade] ?? 0;
    const thresholdRank = GRADE_ORDER[thresholdGrade] ?? GRADE_ORDER['D'];

    if (gradeRank > thresholdRank) continue;

    const { owner, repo: repoName } = repo;

    // Overall health grade issue
    result.push(
      buildIssue(owner, repoName, 'health', 'low-health-grade', 'high', {
        score: repo.score,
        grade: repo.grade,
      }),
    );

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
        }
      }
    }
  }

  return result;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Filter out issues that already have an open match in the repository.
 * Matches by exact title. Closed issues are not considered duplicates.
 */
export async function deduplicateIssues(
  client: GitHubClient,
  planned: RemediationIssue[],
): Promise<{ toCreate: RemediationIssue[]; toSkip: SkippedIssue[] }> {
  const toCreate: RemediationIssue[] = [];
  const toSkip: SkippedIssue[] = [];

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
    } catch {
      // On API error, treat as no duplicates — create anyway
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

  return { toCreate, toSkip };
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
  const { toCreate, toSkip } = await deduplicateIssues(client, allPlanned);

  if (options?.dryRun) {
    return {
      created: [],
      skipped: toSkip,
      planned: toCreate,
      dryRun: true,
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
  for (const issue of toCreate) {
    const result = await issues.createIssue(
      client, issue.owner, issue.repo,
      issue.title, issue.body, issue.labels,
    );
    created.push({
      ...issue,
      issueNumber: (result as { number: number }).number,
      issueUrl: (result as { html_url: string }).html_url,
    });
  }

  return {
    created,
    skipped: toSkip,
    planned: [],
    dryRun: false,
    summary: {
      totalPlanned: allPlanned.length,
      totalCreated: created.length,
      totalSkipped: toSkip.length,
      timestamp: new Date().toISOString(),
    },
  };
}
