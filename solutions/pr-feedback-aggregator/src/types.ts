/**
 * Type definitions for pr-feedback-aggregator.
 *
 * Input types mirror GitHub REST API PR comment shapes.
 * Output types define the aggregated feedback report structure.
 * These are local definitions — data flows via JSON files, not module imports.
 */

// ─── GitHub PR Comment (normalized from REST API) ────────────────────────────

/** A single PR comment normalized from GitHub REST API response. */
export interface PRComment {
  author: string;
  body: string;
  createdAt: string;
  prNumber: number;
  prTitle: string;
  repo: string;
}

// ─── Feedback Analysis Types ─────────────────────────────────────────────────

/** A recurring feedback pattern identified by LLM analysis. */
export interface FeedbackPattern {
  theme: string;
  frequency: number;
  examples: string[];
  repos: string[];
  severity: 'high' | 'medium' | 'low';
}

/** Per-repo feedback summary. */
export interface RepoFeedbackSummary {
  repo: string;
  prCount: number;
  commentCount: number;
  patterns: FeedbackPattern[];
}

// ─── Aggregated Report ───────────────────────────────────────────────────────

/** The final aggregated feedback report across all repos. */
export interface AggregatedReport {
  generatedAt: string;
  repoCount: number;
  totalPRs: number;
  totalComments: number;
  topPatterns: FeedbackPattern[];
  perRepo: RepoFeedbackSummary[];
  recommendations: string[];
}

// ─── Options ─────────────────────────────────────────────────────────────────

/** Options controlling the PR feedback aggregation pipeline. */
export interface PRFeedbackOptions {
  repos: string[];
  outputDir: string;
  dryRun: boolean;
  verbose: boolean;
  maxPRsPerRepo: number;
  since?: string;
  token: string;
}
