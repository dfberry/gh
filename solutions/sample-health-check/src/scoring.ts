/**
 * Scoring model for sample health checks.
 *
 * Additive model: start at 0, award points for healthy signals.
 * Score is normalized to 0-100 regardless of weight totals.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CheckResult {
  dimension: string;
  signal: string;
  passed: boolean;
  weight: number;
  earned: number;
  detail?: string;
}

export interface DimensionSummary {
  earned: number;
  possible: number;
  passRate: number;
}

// ─── Weight Budget ───────────────────────────────────────────────────────────

/** Reference weight budget — sums to exactly 100. */
export const HEALTH_WEIGHTS: Record<string, number> = {
  // Documentation Quality (25)
  readme_exists: 5,
  readme_quality: 5,
  readme_sections: 5,
  license_exists: 5,
  contributing_exists: 3,
  code_of_conduct_exists: 2,
  // Repository Hygiene (12)
  gitignore_exists: 3,
  description_set: 3,
  topics_set: 3,
  not_archived: 2,
  default_branch_main: 1,
  // CI/CD Presence (20)
  has_workflows: 8,
  recent_workflow_success: 7,
  no_failing_workflows: 5,
  // Dependency Freshness (16)
  low_critical_dependabot: 8,
  low_high_dependabot: 5,
  automated_security_fixes: 3,
  // Activity & Maintenance (16)
  recent_commit: 8,
  recent_push: 3,
  manageable_issues: 3,
  has_releases: 2,
  // Branch Protection (5)
  branch_protected: 5,
  // Azure Sample-Specific (6)
  has_azure_topic: 3,
  has_language_topics: 2,
  description_mentions_azure: 1,
} as const;

// ─── Scoring Functions ───────────────────────────────────────────────────────

/**
 * Calculate health score from check results.
 * Normalizes earned/possible to a 0-100 scale.
 */
export function calculateHealthScore(checks: CheckResult[]): {
  score: number;
  grade: string;
  checks: CheckResult[];
} {
  const totalPossible = checks.reduce((sum, c) => sum + c.weight, 0);
  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = totalPossible > 0
    ? Math.max(0, Math.round(totalEarned / totalPossible * 100))
    : 0;

  return {
    score,
    grade: gradeFromScore(score),
    checks,
  };
}

/** Map numeric score to letter grade per Mal's ranges. */
export function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

/** Group checks by dimension and compute pass rates. */
export function generateDimensionSummary(
  checks: CheckResult[],
): Record<string, DimensionSummary> {
  const dims: Record<string, { earned: number; possible: number }> = {};

  for (const check of checks) {
    if (!dims[check.dimension]) {
      dims[check.dimension] = { earned: 0, possible: 0 };
    }
    dims[check.dimension].earned += check.earned;
    dims[check.dimension].possible += check.weight;
  }

  const result: Record<string, DimensionSummary> = {};
  for (const [dim, data] of Object.entries(dims)) {
    result[dim] = {
      earned: data.earned,
      possible: data.possible,
      passRate: data.possible > 0 ? data.earned / data.possible : 0,
    };
  }
  return result;
}
