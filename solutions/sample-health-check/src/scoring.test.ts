import { describe, it, expect } from 'vitest';

import {
  HEALTH_WEIGHTS,
  gradeFromScore,
  calculateHealthScore,
  generateDimensionSummary,
} from './scoring.js';

import type { CheckResult, DimensionSummary } from './scoring.js';

// ─── Weight Validation ───────────────────────────────────────────────────────

describe('HEALTH_WEIGHTS', () => {
  it('should sum to exactly 100', () => {
    const total = Object.values(HEALTH_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});

// ─── Grade Calculation ───────────────────────────────────────────────────────

describe('gradeFromScore', () => {
  it('should return A for score 95', () => {
    expect(gradeFromScore(95)).toBe('A');
  });

  it('should return B for score 80', () => {
    expect(gradeFromScore(80)).toBe('B');
  });

  it('should return C for score 60', () => {
    expect(gradeFromScore(60)).toBe('C');
  });

  it('should return D for score 30', () => {
    expect(gradeFromScore(30)).toBe('D');
  });

  it('should return F for score 10', () => {
    expect(gradeFromScore(10)).toBe('F');
  });

  // Boundary values
  it('should return A for score 100 (max)', () => {
    expect(gradeFromScore(100)).toBe('A');
  });

  it('should return A for score 90 (lower boundary of A)', () => {
    expect(gradeFromScore(90)).toBe('A');
  });

  it('should return B for score 89 (just below A)', () => {
    expect(gradeFromScore(89)).toBe('B');
  });

  it('should return B for score 75 (lower boundary of B)', () => {
    expect(gradeFromScore(75)).toBe('B');
  });

  it('should return C for score 74 (just below B)', () => {
    expect(gradeFromScore(74)).toBe('C');
  });

  it('should return C for score 50 (lower boundary of C)', () => {
    expect(gradeFromScore(50)).toBe('C');
  });

  it('should return D for score 49 (just below C)', () => {
    expect(gradeFromScore(49)).toBe('D');
  });

  it('should return D for score 25 (lower boundary of D)', () => {
    expect(gradeFromScore(25)).toBe('D');
  });

  it('should return F for score 24 (just below D)', () => {
    expect(gradeFromScore(24)).toBe('F');
  });

  it('should return F for score 0 (min)', () => {
    expect(gradeFromScore(0)).toBe('F');
  });
});

// ─── Health Score Calculation ────────────────────────────────────────────────

describe('calculateHealthScore', () => {
  /** Helper: build a CheckResult for testing */
  function makeCheck(
    dimension: string,
    signal: string,
    passed: boolean,
    weight: number,
  ): CheckResult {
    return {
      dimension,
      signal,
      passed,
      weight,
      earned: passed ? weight : 0,
    };
  }

  it('should return score 100 and grade A when all checks pass', () => {
    const checks: CheckResult[] = [
      // Documentation (25 total)
      makeCheck('documentation', 'readme_exists', true, 5),
      makeCheck('documentation', 'readme_quality', true, 5),
      makeCheck('documentation', 'readme_sections', true, 5),
      makeCheck('documentation', 'license_exists', true, 5),
      makeCheck('documentation', 'contributing_exists', true, 3),
      makeCheck('documentation', 'code_of_conduct_exists', true, 2),
      // Hygiene (12 total)
      makeCheck('hygiene', 'gitignore_exists', true, 3),
      makeCheck('hygiene', 'description_set', true, 3),
      makeCheck('hygiene', 'topics_set', true, 3),
      makeCheck('hygiene', 'not_archived', true, 2),
      makeCheck('hygiene', 'default_branch_main', true, 1),
      // CI/CD (20 total)
      makeCheck('ci_cd', 'has_workflows', true, 8),
      makeCheck('ci_cd', 'recent_workflow_success', true, 7),
      makeCheck('ci_cd', 'no_failing_workflows', true, 5),
      // Dependency Freshness (16 total)
      makeCheck('dependency_freshness', 'low_critical_dependabot', true, 8),
      makeCheck('dependency_freshness', 'low_high_dependabot', true, 5),
      makeCheck('dependency_freshness', 'automated_security_fixes', true, 3),
      // Activity (16 total)
      makeCheck('activity', 'recent_commit', true, 8),
      makeCheck('activity', 'recent_push', true, 3),
      makeCheck('activity', 'manageable_issues', true, 3),
      makeCheck('activity', 'has_releases', true, 2),
      // Branch Protection (5 total)
      makeCheck('branch_protection', 'branch_protected', true, 5),
      // Azure (7 total)
      makeCheck('azure', 'has_azure_topic', true, 3),
      makeCheck('azure', 'has_language_topics', true, 2),
      makeCheck('azure', 'description_mentions_azure', true, 2),
    ];

    const result = calculateHealthScore(checks);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('should return score 0 and grade F when no checks pass', () => {
    const checks: CheckResult[] = [
      makeCheck('documentation', 'readme_exists', false, 5),
      makeCheck('documentation', 'readme_quality', false, 5),
      makeCheck('documentation', 'readme_sections', false, 5),
      makeCheck('documentation', 'license_exists', false, 5),
      makeCheck('documentation', 'contributing_exists', false, 3),
      makeCheck('documentation', 'code_of_conduct_exists', false, 2),
      makeCheck('hygiene', 'gitignore_exists', false, 3),
      makeCheck('hygiene', 'description_set', false, 3),
      makeCheck('hygiene', 'topics_set', false, 3),
      makeCheck('hygiene', 'not_archived', false, 2),
      makeCheck('hygiene', 'default_branch_main', false, 1),
      makeCheck('ci_cd', 'has_workflows', false, 8),
      makeCheck('ci_cd', 'recent_workflow_success', false, 7),
      makeCheck('ci_cd', 'no_failing_workflows', false, 5),
      makeCheck('dependency_freshness', 'low_critical_dependabot', false, 8),
      makeCheck('dependency_freshness', 'low_high_dependabot', false, 5),
      makeCheck('dependency_freshness', 'automated_security_fixes', false, 3),
      makeCheck('activity', 'recent_commit', false, 8),
      makeCheck('activity', 'recent_push', false, 3),
      makeCheck('activity', 'manageable_issues', false, 3),
      makeCheck('activity', 'has_releases', false, 2),
      makeCheck('branch_protection', 'branch_protected', false, 5),
      makeCheck('azure', 'has_azure_topic', false, 3),
      makeCheck('azure', 'has_language_topics', false, 2),
      makeCheck('azure', 'description_mentions_azure', false, 2),
    ];

    const result = calculateHealthScore(checks);
    expect(result.score).toBe(0);
    expect(result.grade).toBe('F');
  });

  it('should calculate correct sum for mixed results', () => {
    const checks: CheckResult[] = [
      // Pass: 5 + 5 + 8 + 8 + 5 = 31
      makeCheck('documentation', 'readme_exists', true, 5),
      makeCheck('documentation', 'readme_quality', true, 5),
      makeCheck('ci_cd', 'has_workflows', true, 8),
      makeCheck('activity', 'recent_commit', true, 8),
      makeCheck('branch_protection', 'branch_protected', true, 5),
      // Fail: everything else
      makeCheck('documentation', 'readme_sections', false, 5),
      makeCheck('documentation', 'license_exists', false, 5),
      makeCheck('documentation', 'contributing_exists', false, 3),
      makeCheck('documentation', 'code_of_conduct_exists', false, 2),
      makeCheck('hygiene', 'gitignore_exists', false, 3),
      makeCheck('hygiene', 'description_set', false, 3),
      makeCheck('hygiene', 'topics_set', false, 3),
      makeCheck('hygiene', 'not_archived', false, 2),
      makeCheck('hygiene', 'default_branch_main', false, 1),
      makeCheck('ci_cd', 'recent_workflow_success', false, 7),
      makeCheck('ci_cd', 'no_failing_workflows', false, 5),
      makeCheck('dependency_freshness', 'low_critical_dependabot', false, 8),
      makeCheck('dependency_freshness', 'low_high_dependabot', false, 5),
      makeCheck('dependency_freshness', 'automated_security_fixes', false, 3),
      makeCheck('activity', 'recent_push', false, 3),
      makeCheck('activity', 'manageable_issues', false, 3),
      makeCheck('activity', 'has_releases', false, 2),
      makeCheck('azure', 'has_azure_topic', false, 3),
      makeCheck('azure', 'has_language_topics', false, 2),
      makeCheck('azure', 'description_mentions_azure', false, 2),
    ];

    const result = calculateHealthScore(checks);
    expect(result.score).toBe(31);
    expect(result.grade).toBe('D');
  });

  it('should handle a realistic well-maintained repo scenario', () => {
    // Realistic: most things pass, but missing some community files and Azure topics
    const checks: CheckResult[] = [
      makeCheck('documentation', 'readme_exists', true, 5),
      makeCheck('documentation', 'readme_quality', true, 5),
      makeCheck('documentation', 'readme_sections', true, 5),
      makeCheck('documentation', 'license_exists', true, 5),
      makeCheck('documentation', 'contributing_exists', false, 3),  // missing
      makeCheck('documentation', 'code_of_conduct_exists', false, 2),  // missing
      makeCheck('hygiene', 'gitignore_exists', true, 3),
      makeCheck('hygiene', 'description_set', true, 3),
      makeCheck('hygiene', 'topics_set', true, 3),
      makeCheck('hygiene', 'not_archived', true, 2),
      makeCheck('hygiene', 'default_branch_main', true, 1),
      makeCheck('ci_cd', 'has_workflows', true, 8),
      makeCheck('ci_cd', 'recent_workflow_success', true, 7),
      makeCheck('ci_cd', 'no_failing_workflows', true, 5),
      makeCheck('dependency_freshness', 'low_critical_dependabot', true, 8),
      makeCheck('dependency_freshness', 'low_high_dependabot', true, 5),
      makeCheck('dependency_freshness', 'automated_security_fixes', true, 3),
      makeCheck('activity', 'recent_commit', true, 8),
      makeCheck('activity', 'recent_push', true, 3),
      makeCheck('activity', 'manageable_issues', true, 3),
      makeCheck('activity', 'has_releases', false, 2),  // no releases
      makeCheck('branch_protection', 'branch_protected', true, 5),
      makeCheck('azure', 'has_azure_topic', true, 3),
      makeCheck('azure', 'has_language_topics', true, 2),
      makeCheck('azure', 'description_mentions_azure', false, 2),  // not mentioning Azure in desc
    ];

    // Earned: 100 - 3 - 2 - 2 - 2 = 91
    const result = calculateHealthScore(checks);
    expect(result.score).toBe(91);
    expect(result.grade).toBe('A');
  });
});

// ─── Dimension Summary ───────────────────────────────────────────────────────

describe('generateDimensionSummary', () => {
  function makeCheck(
    dimension: string,
    signal: string,
    passed: boolean,
    weight: number,
  ): CheckResult {
    return { dimension, signal, passed, weight, earned: passed ? weight : 0 };
  }

  it('should group checks by dimension correctly', () => {
    const checks: CheckResult[] = [
      makeCheck('documentation', 'readme_exists', true, 5),
      makeCheck('documentation', 'license_exists', false, 5),
      makeCheck('hygiene', 'gitignore_exists', true, 3),
      makeCheck('ci_cd', 'has_workflows', true, 8),
      makeCheck('ci_cd', 'recent_workflow_success', false, 7),
    ];

    const summary = generateDimensionSummary(checks);

    // documentation: earned 5, possible 10
    expect(summary['documentation']).toBeDefined();
    expect(summary['documentation'].earned).toBe(5);
    expect(summary['documentation'].possible).toBe(10);
    expect(summary['documentation'].passRate).toBeCloseTo(0.5);

    // hygiene: earned 3, possible 3
    expect(summary['hygiene']).toBeDefined();
    expect(summary['hygiene'].earned).toBe(3);
    expect(summary['hygiene'].possible).toBe(3);
    expect(summary['hygiene'].passRate).toBeCloseTo(1.0);

    // ci_cd: earned 8, possible 15
    expect(summary['ci_cd']).toBeDefined();
    expect(summary['ci_cd'].earned).toBe(8);
    expect(summary['ci_cd'].possible).toBe(15);
    expect(summary['ci_cd'].passRate).toBeCloseTo(8 / 15);
  });

  it('should handle all checks passing in one dimension', () => {
    const checks: CheckResult[] = [
      makeCheck('documentation', 'readme_exists', true, 5),
      makeCheck('documentation', 'readme_quality', true, 5),
      makeCheck('documentation', 'readme_sections', true, 5),
    ];

    const summary = generateDimensionSummary(checks);
    expect(summary['documentation'].earned).toBe(15);
    expect(summary['documentation'].possible).toBe(15);
    expect(summary['documentation'].passRate).toBeCloseTo(1.0);
  });

  it('should handle all checks failing in one dimension', () => {
    const checks: CheckResult[] = [
      makeCheck('ci_cd', 'has_workflows', false, 8),
      makeCheck('ci_cd', 'recent_workflow_success', false, 7),
      makeCheck('ci_cd', 'no_failing_workflows', false, 5),
    ];

    const summary = generateDimensionSummary(checks);
    expect(summary['ci_cd'].earned).toBe(0);
    expect(summary['ci_cd'].possible).toBe(20);
    expect(summary['ci_cd'].passRate).toBeCloseTo(0);
  });

  it('should return empty object for empty checks array', () => {
    const summary = generateDimensionSummary([]);
    expect(Object.keys(summary)).toHaveLength(0);
  });
});
