/**
 * Scoring engine — additive scoring, grade calculation, dimension summaries.
 * Same pattern as sample-health-check: additive model, normalize to 0-100.
 */

import type { AzureBPCheckResult, DimensionSummary } from './types.js';

/** Weight budgets per dimension (must sum to 100) */
export const DIMENSION_WEIGHTS: Record<string, number> = {
  'azure-sdk': 25,
  'iac': 25,
  'config': 15,
  'ci-cd': 20,
  'security': 15,
};

/** Grade thresholds: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40 */
export function gradeFromScore(score: number): string {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Calculate normalized score (0-100) from check results.
 * Normalizes earned/possible to a 0-100 scale.
 */
export function calculateScore(checks: AzureBPCheckResult[]): { score: number; grade: string } {
  const totalPossible = checks.reduce((sum, c) => sum + c.weight, 0);
  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = totalPossible > 0
    ? Math.max(0, Math.round(totalEarned / totalPossible * 100))
    : 0;

  return { score, grade: gradeFromScore(score) };
}

/** Generate dimension-level summaries from check results */
export function generateDimensionSummary(checks: AzureBPCheckResult[]): Record<string, DimensionSummary> {
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
