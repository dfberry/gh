/**
 * Type definitions for azure-best-practices-check.
 * Defines the report shape, check results, dimension summaries,
 * and pipeline errors.
 */

export interface AzureBPCheckResult {
  dimension: string;
  signal: string;
  passed: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  weight: number;
  earned: number;
  detail: string;
  recommendation?: string;
}

export interface DimensionSummary {
  earned: number;
  possible: number;
  passRate: number;
}

export interface RepoAzureBPCheck {
  owner: string;
  repo: string;
  checkedAt: string;
  score: number;
  grade: string;
  checks: AzureBPCheckResult[];
  dimensions: Record<string, DimensionSummary>;
  filesAnalyzed: string[];
}

export interface PipelineError {
  repo: string;
  category: 'auth' | 'not_found' | 'rate_limit' | 'api_error' | 'unknown';
  message: string;
  suggestion: string;
}

export interface AzureBestPracticesReport {
  repos: RepoAzureBPCheck[];
  errors?: PipelineError[];
  summary: {
    totalRepos: number;
    avgScore: number;
    avgGrade: string;
    worstDimension: string;
    criticalFindings: number;
    timestamp: string;
  };
}

/** Shape of package.json data relevant to Azure checks */
export interface PackageJsonData {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Shape for root directory listing entries */
export interface RootEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

/** Aggregated data fetched per repo, passed to rules */
export interface RepoFileData {
  rootEntries: RootEntry[];
  packageJson: PackageJsonData | null;
  iacFiles: Array<{ path: string; content: string }>;
  workflowFiles: Array<{ path: string; content: string }>;
  readmeContent: string | null;
  hasEnvExample: boolean;
  hasSecurityPolicy: boolean;
  hasAzureYaml: boolean;
}
