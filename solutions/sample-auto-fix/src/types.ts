/**
 * Type definitions for sample-auto-fix.
 */

// ─── Shared Check Structures ──────────────────────────────────────────────

/** Check result from health-check or azure-best-practices (array element). */
export interface ReportCheckResult {
  dimension: string;
  signal: string;
  passed: boolean;
  weight: number;
  earned: number;
  detail?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
}

/** Dimension summary from health-check or azure-best-practices. */
export interface DimensionSummary {
  earned: number;
  possible: number;
  passRate: number;
}

// ─── Input Structures (from upstream solutions) ───────────────────────────

export interface RemediationIssuesReport {
  created?: Array<{
    repo: string;
    issueNumber: number;
    issueUrl: string;
    findingType: string;
    severity: string;
    owner: string;
    repoName: string;
  }>;
  planned?: Array<{
    repo: string;
    owner?: string;
    repoName?: string;
    title?: string;
    findingType: string;
    severity: string;
    reason?: string;
  }>;
  dryRun?: boolean;
  summary?: {
    totalPlanned: number;
    totalCreated: number;
    totalSkipped: number;
    timestamp: string;
  };
}

export interface SecurityAuditReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    score?: number;
    auditedAt?: string;
    dependabotAlerts?: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    codeScanningAlerts?: {
      total: number;
      enabled?: boolean;
    };
    secretScanningAlerts?: {
      total: number;
      enabled?: boolean;
    };
    branchProtection?: {
      protected?: boolean;
      enabled?: boolean;
      defaultBranch?: string;
    };
    automatedSecurityFixes?: {
      enabled: boolean;
    };
    // Legacy field (old report format)
    securityFiles?: {
      securityMd: boolean;
      dependabotYml: boolean;
    };
  }>;
  summary?: {
    totalRepos: number;
    avgScore: number;
    totalDependabotAlerts: number;
    totalCodeScanningAlerts: number;
    totalSecretScanningAlerts: number;
    reposWithoutBranchProtection: number;
    timestamp: string;
  };
}

export interface HealthCheckReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    score?: number;
    grade?: string;
    checks?: ReportCheckResult[];
    dimensions?: Record<string, DimensionSummary>;
  }>;
  summary?: {
    totalRepos: number;
    avgScore: number;
    avgGrade: string;
    gradeDistribution?: Record<string, number>;
    worstDimension?: string;
    timestamp: string;
  };
}

export interface AzureBestPracticesReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    score?: number;
    grade?: string;
    checks?: ReportCheckResult[];
    dimensions?: Record<string, DimensionSummary>;
    filesAnalyzed?: string[];
  }>;
  summary?: {
    totalRepos: number;
    avgScore: number;
    avgGrade: string;
    worstDimension?: string;
    criticalFindings: number;
    timestamp: string;
  };
}

// ─── Finding Classification ──────────────────────────────────────────────

export type FindingFixability = 'auto-fixable' | 'manual-action' | 'informational';

export interface ClassifiedFinding {
  owner: string;
  repo: string;
  source: 'security' | 'health' | 'azure' | 'remediation';
  signal: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  fixability: FindingFixability;
  manualAction?: string;
}

// ─── Fix Categories ──────────────────────────────────────────────────────

export type FixCategory = 'missing-security-files' | 'missing-azure-config';

// ─── Fixable Findings ───────────────────────────────────────────────────

export interface FixableFinding {
  owner: string;
  repo: string;
  category: FixCategory;
  missingFiles: string[]; // e.g., ['SECURITY.md', '.env.example']
  source: 'remediation' | 'security' | 'health' | 'azure';
}

// ─── Fix Templates ──────────────────────────────────────────────────────

export interface FixTemplate {
  path: string;
  content: string;
  commitMessage: string;
}

// ─── Fix Plan ───────────────────────────────────────────────────────────

export interface FixPlan {
  owner: string;
  repo: string;
  category: FixCategory;
  branch: string;
  prTitle: string;
  prBody: string;
  templates: FixTemplate[];
}

// ─── Execution Results ──────────────────────────────────────────────────

export interface AutoFixResult {
  dryRun: boolean;
  created: CreatedFix[];
  skipped: SkippedFix[];
  errors: FixError[];
  /** Fix plans built during planning (populated in dry-run mode for reporting). */
  plans?: FixPlan[];
  /** All findings from all inputs, classified by fixability. */
  allFindings?: ClassifiedFinding[];
  summary: {
    totalPlanned: number;
    totalCreated: number;
    totalSkipped: number;
    totalErrors: number;
    totalAutoFixable: number;
    totalManualAction: number;
    totalInformational: number;
  };
}

export interface CreatedFix {
  repo: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  category: FixCategory;
  filesModified: string[];
}

export interface SkippedFix {
  repo: string;
  category: FixCategory;
  reason: string;
}

export interface FixError {
  repo: string;
  category: FixCategory;
  message: string;
  suggestion?: string;
}

// ─── Options ────────────────────────────────────────────────────────────

export interface AutoFixOptions {
  verbose?: boolean;
  dryRun?: boolean;
  apply?: boolean;
  categories?: FixCategory[];
}

export interface AutoFixInput {
  remediationInput?: string;
  securityInput?: string;
  healthInput?: string;
  azureInput?: string;
}

// ─── Pipeline Errors ────────────────────────────────────────────────────

export interface PipelineError {
  repo: string;
  stage: 'parse' | 'plan' | 'execute' | 'dedup';
  message: string;
  suggestion?: string;
}
