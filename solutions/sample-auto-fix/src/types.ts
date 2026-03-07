/**
 * Type definitions for sample-auto-fix.
 */

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
    findingType: string;
    severity: string;
    reason?: string;
  }>;
}

export interface SecurityAuditReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    dependabotAlerts?: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    codeScanning?: {
      total: number;
      critical: number;
      high: number;
    };
    secretScanning?: {
      total: number;
    };
    branchProtection?: {
      enabled: boolean;
    };
    securityFiles?: {
      securityMd: boolean;
      dependabotYml: boolean;
    };
  }>;
}

export interface HealthCheckReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    checks?: {
      envExample?: { pass: boolean };
      securityMd?: { pass: boolean };
      dependabotYml?: { pass: boolean };
    };
    grade?: string;
  }>;
}

export interface AzureBestPracticesReport {
  repos: Array<{
    owner: string;
    repo: string;
    isFork?: boolean;
    checks?: {
      azdYaml?: { pass: boolean };
    };
  }>;
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
  summary: {
    totalPlanned: number;
    totalCreated: number;
    totalSkipped: number;
    totalErrors: number;
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
