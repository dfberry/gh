/**
 * Type definitions for pr-feedback-aggregator.
 *
 * Input types mirror GitHub REST API PR comment shapes.
 * Output types define the aggregated feedback report structure.
 * These are local definitions — data flows via JSON files, not module imports.
 */

// ─── Pipeline Error ──────────────────────────────────────────────────────────

/** An error encountered during pipeline execution. */
export interface PipelineError {
  repo: string;
  category: 'auth' | 'not_found' | 'rate_limit' | 'api_error' | 'unknown';
  message: string;
  suggestion: string;
}

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

/** Per-PR metadata collected during feedback pipeline. */
export interface PRInfo {
  number: number;
  title: string;
  commentCount: number;
}

/** Per-repo feedback summary. */
export interface RepoFeedbackSummary {
  repo: string;
  prCount: number;
  commentCount: number;
  patterns: FeedbackPattern[];
  /** Per-PR metadata (populated when available). */
  prs?: PRInfo[];
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
  errors?: PipelineError[];
  /** Whether the report was generated in dry-run mode (LLM analysis skipped). */
  dryRun?: boolean;
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
