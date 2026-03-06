/**
 * PR Feedback Aggregator — Core module.
 *
 * Fetches PR review comments from GitHub repos, uses LLM analysis
 * to identify recurring feedback patterns, and produces aggregated reports.
 */

import { pullRequests } from 'github-rest';
import type { GitHubClient } from 'github-rest';
import { callOpenAI } from 'llm-completion';
import type {
  PRComment,
  FeedbackPattern,
  RepoFeedbackSummary,
  AggregatedReport,
  PRFeedbackOptions,
  PipelineError,
} from './types.js';

// Re-export types for convenience
export type {
  PRComment,
  FeedbackPattern,
  RepoFeedbackSummary,
  AggregatedReport,
  PRFeedbackOptions,
  PipelineError,
} from './types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default number of PRs to fetch per repo. */
export const DEFAULT_MAX_PRS_PER_REPO = 20;

/** Maximum character length for a single comment body (truncate beyond). */
export const MAX_COMMENT_LENGTH = 10000;

/** Bot username suffixes to filter out. */
export const BOT_SUFFIXES: string[] = ['[bot]'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBot(login: string): boolean {
  return BOT_SUFFIXES.some((suffix) => login.endsWith(suffix));
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

// ─── Core Functions ──────────────────────────────────────────────────────────

export interface FetchPRCommentsOptions {
  maxPRs: number;
  since?: string;
}

export async function fetchPRComments(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: FetchPRCommentsOptions,
  verbose = false,
): Promise<PRComment[]> {
  let url = `/repos/${owner}/${repo}/pulls?state=all&sort=updated&per_page=100`;
  if (options.since) {
    url += `&since=${options.since}`;
  }

  let prs: any[];
  try {
    if (verbose) {
      console.log(`    ${owner}/${repo}: fetching PRs...`);
    }
    prs = await client.get<any[]>(url);
  } catch (err: any) {
    if (err.status === 403) {
      throw new Error('GitHub API rate limit exceeded');
    }
    if (err.status === 401) {
      throw new Error(`GitHub API error 401`);
    }
    throw err;
  }

  // Filter by since date if provided
  if (options.since) {
    const sinceDate = new Date(options.since).getTime();
    prs = prs.filter(
      (pr: any) => new Date(pr.updated_at).getTime() >= sinceDate,
    );
  }

  // Limit to maxPRs
  prs = prs.slice(0, options.maxPRs);

  const result: PRComment[] = [];

  for (const pr of prs) {
    const { issueComments, reviewComments } =
      await pullRequests.getPullRequestComments(client, owner, repo, pr.number);

    const allComments = [...issueComments, ...reviewComments];

    for (const c of allComments) {
      // Skip null/empty bodies
      if (!c.body) continue;

      // Skip null user or bot authors
      const login = c.user?.login;
      if (!login) continue;
      if (isBot(login)) continue;

      result.push({
        author: login,
        body: c.body.length > MAX_COMMENT_LENGTH
          ? c.body.slice(0, MAX_COMMENT_LENGTH)
          : c.body,
        createdAt: c.created_at,
        prNumber: pr.number,
        prTitle: pr.title,
        repo: `${owner}/${repo}`,
      });
    }
  }

  return result;
}

export async function extractPatterns(
  comments: PRComment[],
): Promise<FeedbackPattern[]> {
  if (comments.length === 0) return [];

  const commentBodies = comments.map((c) => c.body).join('\n---\n');
  const uniqueRepos = [...new Set(comments.map((c) => c.repo))];

  const prompt = `Analyze the following PR review comments and identify recurring feedback patterns.
Return a JSON object with this shape: { "patterns": [ { "theme": string, "frequency": number, "examples": string[], "repos": string[], "severity": "high" | "medium" | "low" } ] }

Repos involved: ${uniqueRepos.join(', ')}

Comments:
${commentBodies}`;

  try {
    const response = await callOpenAI(prompt);
    const parsed = JSON.parse(response);
    if (parsed && Array.isArray(parsed.patterns)) {
      return parsed.patterns as FeedbackPattern[];
    }
    return [];
  } catch {
    return [];
  }
}

export function aggregateResults(
  repoSummaries: RepoFeedbackSummary[],
): AggregatedReport {
  if (repoSummaries.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      repoCount: 0,
      totalPRs: 0,
      totalComments: 0,
      topPatterns: [],
      perRepo: [],
      recommendations: [],
    };
  }

  const totalPRs = repoSummaries.reduce((sum, r) => sum + r.prCount, 0);
  const totalComments = repoSummaries.reduce(
    (sum, r) => sum + r.commentCount,
    0,
  );

  // Deduplicate patterns by theme
  const patternMap = new Map<string, FeedbackPattern>();
  for (const summary of repoSummaries) {
    for (const p of summary.patterns) {
      const existing = patternMap.get(p.theme);
      if (existing) {
        existing.frequency += p.frequency;
        existing.examples = [...existing.examples, ...p.examples];
        existing.repos = [...new Set([...existing.repos, ...p.repos])];
        // Keep highest severity
        const severityOrder: Record<string, number> = {
          high: 3,
          medium: 2,
          low: 1,
        };
        if (severityOrder[p.severity] > severityOrder[existing.severity]) {
          existing.severity = p.severity;
        }
      } else {
        patternMap.set(p.theme, { ...p, repos: [...p.repos], examples: [...p.examples] });
      }
    }
  }

  const topPatterns = [...patternMap.values()].sort(
    (a, b) => b.frequency - a.frequency,
  );

  // Generate recommendations for high-severity patterns
  const recommendations: string[] = topPatterns
    .filter((p) => p.severity === 'high')
    .map(
      (p) =>
        `Address: ${p.theme} (found ${p.frequency} times across ${p.repos.length} repos)`,
    );

  return {
    generatedAt: new Date().toISOString(),
    repoCount: repoSummaries.length,
    totalPRs,
    totalComments,
    topPatterns,
    perRepo: repoSummaries,
    recommendations,
  };
}

export async function generateReport(
  client: GitHubClient,
  options: PRFeedbackOptions,
): Promise<AggregatedReport> {
  const verbose = options.verbose ?? false;

  if (options.repos.length === 0) {
    return aggregateResults([]);
  }

  if (verbose) {
    console.log(`  Analyzing ${options.repos.length} repositories...`);
  }

  const summaries: RepoFeedbackSummary[] = [];
  const errors: PipelineError[] = [];

  for (const fullRepo of options.repos) {
    const [owner, repo] = fullRepo.split('/');

    let comments: PRComment[] = [];
    let prCount = 0;

    try {
      comments = await fetchPRComments(client, owner, repo, {
        maxPRs: options.maxPRsPerRepo,
        since: options.since,
      }, verbose);

      // Estimate PR count from unique prNumbers in comments
      const uniquePRs = new Set(comments.map((c) => c.prNumber));
      prCount = uniquePRs.size;

      if (verbose) {
        console.log(`    ✓ ${owner}/${repo}: ${prCount} PRs, ${comments.length} comments`);
      }
    } catch (err: any) {
      const status = err.status ?? 0;
      const message = err.message ?? String(err);
      if (status === 404 || message.includes('Not Found')) {
        if (verbose) {
          console.log(`    ⚠ ${owner}/${repo}: not found, skipping`);
        }
      } else if (status === 401 || message.includes('401')) {
        if (verbose) {
          console.log(`    ⚠ ${owner}/${repo}: authentication failed (401), skipping`);
        }
      } else if (status === 403 || message.includes('rate limit')) {
        if (verbose) {
          console.log(`    ⚠ ${owner}/${repo}: rate limited (403), skipping`);
        }
      } else {
        if (verbose) {
          console.log(`    ⚠ ${owner}/${repo}: ${message}`);
        }
      }
      errors.push(categorizePipelineError(fullRepo, err));
      summaries.push({
        repo: fullRepo,
        prCount: 0,
        commentCount: 0,
        patterns: [],
      });
      continue;
    }

    let patterns: FeedbackPattern[] = [];
    if (!options.dryRun && comments.length > 0) {
      patterns = await extractPatterns(comments);
    } else if (options.dryRun && verbose) {
      console.log(`    (dry-run: skipping LLM analysis)`);
    }

    summaries.push({
      repo: fullRepo,
      prCount,
      commentCount: comments.length,
      patterns,
    });
  }

  const result = aggregateResults(summaries);
  if (errors.length > 0) {
    result.errors = errors;
  }

  if (verbose) {
    console.log(`  Aggregated: ${result.totalPRs} PRs, ${result.totalComments} comments, ${result.topPatterns.length} patterns`);
  }

  return result;
}

export function generateMarkdownSummary(
  report: AggregatedReport,
): string {
  if (
    report.repoCount === 0 &&
    report.totalPRs === 0 &&
    report.totalComments === 0 &&
    report.topPatterns.length === 0
  ) {
    return '# PR Feedback Report\n\nNo data available.';
  }

  const lines: string[] = [];

  lines.push(
    `# PR Feedback Report\n`,
    `**${report.repoCount}** repos | **${report.totalPRs}** PRs | **${report.totalComments}** comments\n`,
    `Generated: ${report.generatedAt}\n`,
  );

  // Top patterns
  if (report.topPatterns.length > 0) {
    lines.push(`## Top Patterns\n`);
    for (const p of report.topPatterns) {
      lines.push(`### ${p.theme}\n`);
      lines.push(`- **Severity:** ${p.severity}`);
      lines.push(`- **Frequency:** ${p.frequency}`);
      if (p.examples.length > 0) {
        lines.push(`- **Examples:**`);
        for (const ex of p.examples) {
          lines.push(`  - ${ex}`);
        }
      }
      lines.push('');
    }
  }

  // Per-repo breakdown
  if (report.perRepo.length > 0) {
    lines.push(`## Per-Repo Breakdown\n`);
    for (const r of report.perRepo) {
      lines.push(
        `- **${r.repo}**: ${r.prCount} PRs, ${r.commentCount} comments`,
      );
    }
    lines.push('');
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push(`## Recommendations\n`);
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
