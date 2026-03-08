/**
 * scoring.test.ts — Tests the scoring engine.
 *
 * Coverage:
 *   - DIMENSION_WEIGHTS sum to 100
 *   - gradeFromScore boundary values (A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40)
 *   - calculateScore: perfect (100), zero (0), mixed, normalized
 *   - generateDimensionSummary: grouping, passRate, earned/possible
 */

import { describe, it, expect } from 'vitest';

import {
  DIMENSION_WEIGHTS,
  gradeFromScore,
  calculateScore,
  generateDimensionSummary,
} from './scoring.js';

import type { AzureBPCheckResult } from './types.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeCheck(
  dimension: string,
  signal: string,
  passed: boolean,
  weight: number,
  severity: 'critical' | 'high' | 'medium' | 'low' = 'medium',
): AzureBPCheckResult {
  return {
    dimension,
    signal,
    passed,
    severity,
    weight,
    earned: passed ? weight : 0,
    detail: passed ? `${signal} OK` : `${signal} failed`,
  };
}

/** Build all 15 checks with all passing (perfect score = 100) */
function makeAllPassingChecks(): AzureBPCheckResult[] {
  return [
    // azure-sdk (25): 8 + 7 + 6 + 4
    makeCheck('azure-sdk', 'azure-identity-present', true, 8, 'high'),
    makeCheck('azure-sdk', 'no-deprecated-azure-sdk', true, 7, 'medium'),
    makeCheck('azure-sdk', 'uses-modern-azure-sdk', true, 6, 'medium'),
    makeCheck('azure-sdk', 'azure-types-present', true, 4, 'low'),
    // iac (25): 8 + 10 + 7
    makeCheck('iac', 'iac-present', true, 8, 'medium'),
    makeCheck('iac', 'iac-no-hardcoded-secrets', true, 10, 'critical'),
    makeCheck('iac', 'iac-parameterized', true, 7, 'medium'),
    // config (15): 4 + 6 + 5
    makeCheck('config', 'azd-yaml-present', true, 4, 'low'),
    makeCheck('config', 'env-example-present', true, 6, 'medium'),
    makeCheck('config', 'security-policy-present', true, 5, 'low'),
    // ci-cd (20): 8 + 7 + 5
    makeCheck('ci-cd', 'workflow-federated-auth', true, 8, 'high'),
    makeCheck('ci-cd', 'workflow-no-hardcoded-creds', true, 7, 'critical'),
    makeCheck('ci-cd', 'workflow-current-actions', true, 5, 'medium'),
    // security (15): 10 + 5
    makeCheck('security', 'no-connection-strings-in-source', true, 10, 'critical'),
    makeCheck('security', 'managed-identity-documented', true, 5, 'low'),
  ];
}

/** Build all 15 checks with all failing (zero score = 0) */
function makeAllFailingChecks(): AzureBPCheckResult[] {
  return [
    makeCheck('azure-sdk', 'azure-identity-present', false, 8, 'high'),
    makeCheck('azure-sdk', 'no-deprecated-azure-sdk', false, 7, 'medium'),
    makeCheck('azure-sdk', 'uses-modern-azure-sdk', false, 6, 'medium'),
    makeCheck('azure-sdk', 'azure-types-present', false, 4, 'low'),
    makeCheck('iac', 'iac-present', false, 8, 'medium'),
    makeCheck('iac', 'iac-no-hardcoded-secrets', false, 10, 'critical'),
    makeCheck('iac', 'iac-parameterized', false, 7, 'medium'),
    makeCheck('config', 'azd-yaml-present', false, 4, 'low'),
    makeCheck('config', 'env-example-present', false, 6, 'medium'),
    makeCheck('config', 'security-policy-present', false, 5, 'low'),
    makeCheck('ci-cd', 'workflow-federated-auth', false, 8, 'high'),
    makeCheck('ci-cd', 'workflow-no-hardcoded-creds', false, 7, 'critical'),
    makeCheck('ci-cd', 'workflow-current-actions', false, 5, 'medium'),
    makeCheck('security', 'no-connection-strings-in-source', false, 10, 'critical'),
    makeCheck('security', 'managed-identity-documented', false, 5, 'low'),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIMENSION_WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DIMENSION_WEIGHTS', () => {
  it('should sum to exactly 100', () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });

  it('should have exactly 5 dimensions', () => {
    expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(5);
  });

  it('should include all expected dimensions', () => {
    expect(DIMENSION_WEIGHTS['azure-sdk']).toBe(25);
    expect(DIMENSION_WEIGHTS['iac']).toBe(25);
    expect(DIMENSION_WEIGHTS['config']).toBe(15);
    expect(DIMENSION_WEIGHTS['ci-cd']).toBe(20);
    expect(DIMENSION_WEIGHTS['security']).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// gradeFromScore
// ═══════════════════════════════════════════════════════════════════════════════

describe('gradeFromScore', () => {
  // Standard values
  it('should return A for score 95', () => {
    expect(gradeFromScore(95)).toBe('A');
  });

  it('should return B for score 75', () => {
    expect(gradeFromScore(75)).toBe('B');
  });

  it('should return C for score 60', () => {
    expect(gradeFromScore(60)).toBe('C');
  });

  it('should return D for score 45', () => {
    expect(gradeFromScore(45)).toBe('D');
  });

  it('should return F for score 20', () => {
    expect(gradeFromScore(20)).toBe('F');
  });

  // Boundary values per Mal's spec: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40
  it('should return A for score 100 (max)', () => {
    expect(gradeFromScore(100)).toBe('A');
  });

  it('should return A for score 85 (lower boundary of A)', () => {
    expect(gradeFromScore(85)).toBe('A');
  });

  it('should return B for score 84 (just below A)', () => {
    expect(gradeFromScore(84)).toBe('B');
  });

  it('should return B for score 70 (lower boundary of B)', () => {
    expect(gradeFromScore(70)).toBe('B');
  });

  it('should return C for score 69 (just below B)', () => {
    expect(gradeFromScore(69)).toBe('C');
  });

  it('should return C for score 55 (lower boundary of C)', () => {
    expect(gradeFromScore(55)).toBe('C');
  });

  it('should return D for score 54 (just below C)', () => {
    expect(gradeFromScore(54)).toBe('D');
  });

  it('should return D for score 40 (lower boundary of D)', () => {
    expect(gradeFromScore(40)).toBe('D');
  });

  it('should return F for score 39 (just below D)', () => {
    expect(gradeFromScore(39)).toBe('F');
  });

  it('should return F for score 0 (min)', () => {
    expect(gradeFromScore(0)).toBe('F');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateScore
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateScore', () => {
  it('should return score 100 and grade A when all 15 checks pass', () => {
    const checks = makeAllPassingChecks();
    const result = calculateScore(checks);

    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('should return score 0 and grade F when all 15 checks fail', () => {
    const checks = makeAllFailingChecks();
    const result = calculateScore(checks);

    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });

  it('should calculate correct mixed score', () => {
    // Pass only azure-sdk (25) + security (15) = 40 earned out of 100
    const checks: AzureBPCheckResult[] = [
      // azure-sdk: all pass (25)
      makeCheck('azure-sdk', 'azure-identity-present', true, 8, 'high'),
      makeCheck('azure-sdk', 'no-deprecated-azure-sdk', true, 7, 'medium'),
      makeCheck('azure-sdk', 'uses-modern-azure-sdk', true, 6, 'medium'),
      makeCheck('azure-sdk', 'azure-types-present', true, 4, 'low'),
      // iac: all fail (0/25)
      makeCheck('iac', 'iac-present', false, 8, 'medium'),
      makeCheck('iac', 'iac-no-hardcoded-secrets', false, 10, 'critical'),
      makeCheck('iac', 'iac-parameterized', false, 7, 'medium'),
      // config: all fail (0/15)
      makeCheck('config', 'azd-yaml-present', false, 4, 'low'),
      makeCheck('config', 'env-example-present', false, 6, 'medium'),
      makeCheck('config', 'security-policy-present', false, 5, 'low'),
      // ci-cd: all fail (0/20)
      makeCheck('ci-cd', 'workflow-federated-auth', false, 8, 'high'),
      makeCheck('ci-cd', 'workflow-no-hardcoded-creds', false, 7, 'critical'),
      makeCheck('ci-cd', 'workflow-current-actions', false, 5, 'medium'),
      // security: all pass (15)
      makeCheck('security', 'no-connection-strings-in-source', true, 10, 'critical'),
      makeCheck('security', 'managed-identity-documented', true, 5, 'low'),
    ];

    const result = calculateScore(checks);
    // earned: 25 + 15 = 40, possible: 100 → score = 40
    expect(result.score).toBe(40);
    expect(result.grade).toBe('D');
  });

  it('should handle a realistic mid-range scenario', () => {
    // Pass critical checks, fail some config/doc
    const checks: AzureBPCheckResult[] = [
      // azure-sdk: 3 of 4 pass (8+7+6=21 earned, 25 possible)
      makeCheck('azure-sdk', 'azure-identity-present', true, 8, 'high'),
      makeCheck('azure-sdk', 'no-deprecated-azure-sdk', true, 7, 'medium'),
      makeCheck('azure-sdk', 'uses-modern-azure-sdk', true, 6, 'medium'),
      makeCheck('azure-sdk', 'azure-types-present', false, 4, 'low'),
      // iac: all pass (25)
      makeCheck('iac', 'iac-present', true, 8, 'medium'),
      makeCheck('iac', 'iac-no-hardcoded-secrets', true, 10, 'critical'),
      makeCheck('iac', 'iac-parameterized', true, 7, 'medium'),
      // config: 1 of 3 pass (4 earned, 15 possible)
      makeCheck('config', 'azd-yaml-present', true, 4, 'low'),
      makeCheck('config', 'env-example-present', false, 6, 'medium'),
      makeCheck('config', 'security-policy-present', false, 5, 'low'),
      // ci-cd: 2 of 3 pass (8+5=13 earned, 20 possible)
      makeCheck('ci-cd', 'workflow-federated-auth', true, 8, 'high'),
      makeCheck('ci-cd', 'workflow-no-hardcoded-creds', false, 7, 'critical'),
      makeCheck('ci-cd', 'workflow-current-actions', true, 5, 'medium'),
      // security: all pass (15)
      makeCheck('security', 'no-connection-strings-in-source', true, 10, 'critical'),
      makeCheck('security', 'managed-identity-documented', true, 5, 'low'),
    ];

    const result = calculateScore(checks);
    // earned: 21 + 25 + 4 + 13 + 15 = 78
    expect(result.score).toBe(78);
    expect(result.grade).toBe('B');
  });

  it('should normalize score as (earned / possible) * 100', () => {
    const checks: AzureBPCheckResult[] = [
      // Pass some, fail some — total earned = 55
      makeCheck('azure-sdk', 'azure-identity-present', true, 8, 'high'),      // 8
      makeCheck('azure-sdk', 'no-deprecated-azure-sdk', true, 7, 'medium'),    // 7
      makeCheck('azure-sdk', 'uses-modern-azure-sdk', false, 6, 'medium'),     // 0
      makeCheck('azure-sdk', 'azure-types-present', false, 4, 'low'),          // 0
      makeCheck('iac', 'iac-present', true, 8, 'medium'),                       // 8
      makeCheck('iac', 'iac-no-hardcoded-secrets', true, 10, 'critical'),       // 10
      makeCheck('iac', 'iac-parameterized', false, 7, 'medium'),                // 0
      makeCheck('config', 'azd-yaml-present', true, 4, 'low'),                  // 4
      makeCheck('config', 'env-example-present', true, 6, 'medium'),            // 6
      makeCheck('config', 'security-policy-present', false, 5, 'low'),          // 0
      makeCheck('ci-cd', 'workflow-federated-auth', false, 8, 'high'),           // 0
      makeCheck('ci-cd', 'workflow-no-hardcoded-creds', true, 7, 'critical'),    // 7
      makeCheck('ci-cd', 'workflow-current-actions', false, 5, 'medium'),        // 0
      makeCheck('security', 'no-connection-strings-in-source', false, 10, 'critical'), // 0
      makeCheck('security', 'managed-identity-documented', true, 5, 'low'),      // 5
    ];

    const result = calculateScore(checks);
    // earned: 8+7+8+10+4+6+7+5 = 55
    expect(result.score).toBe(55);
    expect(result.grade).toBe('C');
  });

  it('should handle empty checks array as zero score', () => {
    const result = calculateScore([]);

    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });

  it('should map score to correct grade at each threshold', () => {
    // 85 → A
    const a85 = makeAllPassingChecks();
    // Remove 15 points: fail security (10 + 5 = 15 points)
    a85[a85.length - 1] = makeCheck('security', 'managed-identity-documented', false, 5, 'low');
    a85[a85.length - 2] = makeCheck('security', 'no-connection-strings-in-source', false, 10, 'critical');
    const res85 = calculateScore(a85);
    expect(res85.score).toBe(85);
    expect(res85.grade).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateDimensionSummary
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateDimensionSummary', () => {
  it('should group checks by dimension and compute earned/possible/passRate', () => {
    const checks: AzureBPCheckResult[] = [
      makeCheck('azure-sdk', 'azure-identity-present', true, 8, 'high'),
      makeCheck('azure-sdk', 'no-deprecated-azure-sdk', false, 7, 'medium'),
      makeCheck('iac', 'iac-present', true, 8, 'medium'),
      makeCheck('iac', 'iac-no-hardcoded-secrets', true, 10, 'critical'),
      makeCheck('iac', 'iac-parameterized', false, 7, 'medium'),
    ];

    const summary = generateDimensionSummary(checks);

    // azure-sdk: earned 8, possible 15
    expect(summary['azure-sdk']).toBeDefined();
    expect(summary['azure-sdk'].earned).toBe(8);
    expect(summary['azure-sdk'].possible).toBe(15);
    expect(summary['azure-sdk'].passRate).toBeCloseTo(8 / 15);

    // iac: earned 18, possible 25
    expect(summary['iac']).toBeDefined();
    expect(summary['iac'].earned).toBe(18);
    expect(summary['iac'].possible).toBe(25);
    expect(summary['iac'].passRate).toBeCloseTo(18 / 25);
  });

  it('should return passRate 1.0 when all checks in a dimension pass', () => {
    const checks: AzureBPCheckResult[] = [
      makeCheck('config', 'azd-yaml-present', true, 4, 'low'),
      makeCheck('config', 'env-example-present', true, 6, 'medium'),
      makeCheck('config', 'security-policy-present', true, 5, 'low'),
    ];

    const summary = generateDimensionSummary(checks);

    expect(summary['config'].earned).toBe(15);
    expect(summary['config'].possible).toBe(15);
    expect(summary['config'].passRate).toBeCloseTo(1.0);
  });

  it('should return passRate 0 when all checks in a dimension fail', () => {
    const checks: AzureBPCheckResult[] = [
      makeCheck('ci-cd', 'workflow-federated-auth', false, 8, 'high'),
      makeCheck('ci-cd', 'workflow-no-hardcoded-creds', false, 7, 'critical'),
      makeCheck('ci-cd', 'workflow-current-actions', false, 5, 'medium'),
    ];

    const summary = generateDimensionSummary(checks);

    expect(summary['ci-cd'].earned).toBe(0);
    expect(summary['ci-cd'].possible).toBe(20);
    expect(summary['ci-cd'].passRate).toBeCloseTo(0);
  });

  it('should return empty object for empty checks array', () => {
    const summary = generateDimensionSummary([]);
    expect(Object.keys(summary)).toHaveLength(0);
  });

  it('should compute summaries for all 5 dimensions from full check set', () => {
    const checks = makeAllPassingChecks();
    const summary = generateDimensionSummary(checks);

    expect(Object.keys(summary)).toHaveLength(5);
    expect(summary['azure-sdk'].possible).toBe(25);
    expect(summary['iac'].possible).toBe(25);
    expect(summary['config'].possible).toBe(15);
    expect(summary['ci-cd'].possible).toBe(20);
    expect(summary['security'].possible).toBe(15);

    // All pass → all earned = possible
    for (const dim of Object.values(summary)) {
      expect(dim.earned).toBe(dim.possible);
      expect(dim.passRate).toBeCloseTo(1.0);
    }
  });
});
