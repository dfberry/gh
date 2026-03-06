/**
 * Type definitions for create-remediation-issues.
 *
 * Input types mirror the JSON output of security-audit-repos and sample-health-check.
 * These are local definitions (not imported from sibling solutions) because
 * the solution reads JSON files, not module imports.
 */

// ─── Security Audit Report (mirrors security-audit-repos output) ─────────────

export interface DependabotAlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  alerts: unknown[];
}

export interface CodeScanningAlertSummary {
  total: number;
  alerts: unknown[];
  enabled: boolean;
}

export interface SecretScanningAlertSummary {
  total: number;
  alerts: unknown[];
  enabled: boolean;
}

export interface SecurityAdvisorySummary {
  total: number;
  advisories: unknown[];
}

export interface BranchProtectionSummary {
  defaultBranch: string;
  protected: boolean;
  rules?: unknown;
}

export interface AutomatedSecurityFixesSummary {
  enabled: boolean;
}

export interface RepoSecurityAudit {
  owner: string;
  repo: string;
  auditedAt: string;
  score: number;
  dependabotAlerts: DependabotAlertSummary;
  codeScanningAlerts: CodeScanningAlertSummary;
  secretScanningAlerts: SecretScanningAlertSummary;
  securityAdvisories: SecurityAdvisorySummary;
  branchProtection: BranchProtectionSummary;
  automatedSecurityFixes: AutomatedSecurityFixesSummary;
}

export interface SecurityAuditReport {
  repos: RepoSecurityAudit[];
  summary: {
    totalRepos: number;
    avgScore: number;
    totalDependabotAlerts: number;
    totalCodeScanningAlerts: number;
    totalSecretScanningAlerts: number;
    reposWithoutBranchProtection: number;
    timestamp: string;
  };
}

// ─── Health Check Report (mirrors sample-health-check output) ────────────────

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
  summary: {
    totalRepos: number;
    avgScore: number;
    avgGrade: string;
    gradeDistribution: Record<string, number>;
    worstDimension: string;
    timestamp: string;
  };
}

// ─── Remediation Types ───────────────────────────────────────────────────────

/** A planned GitHub issue to create for a finding. */
export interface RemediationIssue {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
  source: 'security' | 'health';
  findingType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/** Options controlling remediation behavior. */
export interface RemediationOptions {
  /** If true, return planned issues without creating them. */
  dryRun?: boolean;
  /** Security score threshold — create issues for repos below this (default: 70). */
  securityScoreThreshold?: number;
  /** Health grade threshold — create issues for repos at this grade or worse (default: 'D'). */
  healthGradeThreshold?: string;
  /** Additional labels to apply to all created issues. */
  extraLabels?: string[];
  /** Enable verbose logging. */
  verbose?: boolean;
}

/** Combined input from both report types. */
export interface RemediationInput {
  securityReport?: SecurityAuditReport;
  healthReport?: HealthCheckReport;
}

/** An issue that was successfully created. */
export interface CreatedIssue extends RemediationIssue {
  issueNumber: number;
  issueUrl: string;
}

/** An issue that was skipped (e.g., duplicate). */
export interface SkippedIssue extends RemediationIssue {
  reason: string;
  existingIssueNumber?: number;
}

/** Output of the remediation process. */
export interface RemediationResult {
  created: CreatedIssue[];
  skipped: SkippedIssue[];
  planned: RemediationIssue[];
  dryRun: boolean;
  summary: {
    totalPlanned: number;
    totalCreated: number;
    totalSkipped: number;
    timestamp: string;
  };
}
