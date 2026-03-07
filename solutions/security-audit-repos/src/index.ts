import type { GitHubClient } from 'github-rest';
import { alerts, security, repos } from 'github-rest';

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
  dependabotAlerts: DependabotAlertSummary;
  codeScanningAlerts: CodeScanningAlertSummary;
  secretScanningAlerts: SecretScanningAlertSummary;
  securityAdvisories: SecurityAdvisorySummary;
  branchProtection: BranchProtectionSummary;
  automatedSecurityFixes: AutomatedSecurityFixesSummary;
  score: number;
}

export interface SecurityAuditReport {
  repos: RepoSecurityAudit[];
  errors?: PipelineError[];
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

export interface AuditOptions {
  verbose?: boolean;
}

/** An error encountered during pipeline execution. */
export interface PipelineError {
  repo: string;
  category: 'auth' | 'not_found' | 'rate_limit' | 'api_error' | 'unknown';
  message: string;
  suggestion: string;
}

/**
 * Calculate security score for a repository
 * Starts at 100 and deducts points for security issues
 */
function calculateSecurityScore(audit: Omit<RepoSecurityAudit, 'score'>): number {
  let score = 100;

  // Dependabot alerts
  score -= audit.dependabotAlerts.critical * 20;
  score -= audit.dependabotAlerts.high * 10;
  score -= audit.dependabotAlerts.medium * 5;

  // Secret scanning alerts
  score -= audit.secretScanningAlerts.total * 15;

  // Code scanning alerts
  score -= audit.codeScanningAlerts.total * 10;

  // Branch protection
  if (!audit.branchProtection.protected) {
    score -= 25;
  }

  // Automated security fixes
  if (!audit.automatedSecurityFixes.enabled) {
    score -= 10;
  }

  // Floor at 0
  return Math.max(0, score);
}

/**
 * Count Dependabot alerts by severity
 */
function categorizeDependabotAlerts(alerts: any[]): DependabotAlertSummary {
  const summary: DependabotAlertSummary = {
    total: alerts.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    alerts
  };

  for (const alert of alerts) {
    const severity = alert.security_advisory?.severity?.toLowerCase() || 'unknown';
    if (severity === 'critical') summary.critical++;
    else if (severity === 'high') summary.high++;
    else if (severity === 'medium') summary.medium++;
    else if (severity === 'low') summary.low++;
  }

  return summary;
}

/**
 * Audit a single repository for security posture
 * Returns comprehensive security metrics and calculated score
 */
export async function auditRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
  options?: AuditOptions
): Promise<RepoSecurityAudit> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`  Auditing ${owner}/${repo}...`);
  }

  // Get repository default branch using shared helper (DRY)
  let defaultBranch = 'main';
  try {
    defaultBranch = await repos.getDefaultBranch(client, owner, repo) ?? 'main';
  } catch (error) {
    if (verbose) {
      console.log(`    ⚠ Could not fetch repo metadata: ${(error as Error).message}`);
    }
  }

  // Fetch all security data in parallel with error handling
  const [
    dependabotAlertsResult,
    codeScanningAlertsResult,
    secretScanningAlertsResult,
    securityAdvisoriesResult,
    branchProtectionResult,
    automatedSecurityFixesResult
  ] = await Promise.allSettled([
    alerts.listDependabotAlerts(client, owner, repo),
    alerts.listCodeScanningAlerts(client, owner, repo),
    alerts.listSecretScanningAlerts(client, owner, repo),
    alerts.listRepositorySecurityAdvisories(client, owner, repo),
    security.getBranchProtection(client, owner, repo, defaultBranch),
    security.getAutomatedSecurityFixes(client, owner, repo)
  ]);

  // Process Dependabot alerts
  const dependabotAlerts = dependabotAlertsResult.status === 'fulfilled' 
    ? (Array.isArray(dependabotAlertsResult.value) ? dependabotAlertsResult.value : [])
    : [];
  const dependabotSummary = categorizeDependabotAlerts(dependabotAlerts);

  // Process code scanning alerts
  const codeScanningAlerts = codeScanningAlertsResult.status === 'fulfilled'
    ? (Array.isArray(codeScanningAlertsResult.value) ? codeScanningAlertsResult.value : [])
    : [];
  const codeScanningEnabled = codeScanningAlertsResult.status === 'fulfilled';

  // Process secret scanning alerts
  const secretScanningAlerts = secretScanningAlertsResult.status === 'fulfilled'
    ? (Array.isArray(secretScanningAlertsResult.value) ? secretScanningAlertsResult.value : [])
    : [];
  const secretScanningEnabled = secretScanningAlertsResult.status === 'fulfilled';

  // Process security advisories
  const securityAdvisories = securityAdvisoriesResult.status === 'fulfilled'
    ? (Array.isArray(securityAdvisoriesResult.value) ? securityAdvisoriesResult.value : [])
    : [];

  // Process branch protection
  const branchProtectionData = branchProtectionResult.status === 'fulfilled'
    ? branchProtectionResult.value
    : null;

  // Process automated security fixes
  const automatedSecurityFixesData = automatedSecurityFixesResult.status === 'fulfilled'
    ? automatedSecurityFixesResult.value as any
    : null;

  // Build audit result
  const auditResult: Omit<RepoSecurityAudit, 'score'> = {
    owner,
    repo,
    auditedAt: new Date().toISOString(),
    dependabotAlerts: dependabotSummary,
    codeScanningAlerts: {
      total: codeScanningAlerts.length,
      alerts: codeScanningAlerts,
      enabled: codeScanningEnabled
    },
    secretScanningAlerts: {
      total: secretScanningAlerts.length,
      alerts: secretScanningAlerts,
      enabled: secretScanningEnabled
    },
    securityAdvisories: {
      total: securityAdvisories.length,
      advisories: securityAdvisories
    },
    branchProtection: {
      defaultBranch,
      protected: !!branchProtectionData,
      rules: branchProtectionData || undefined
    },
    automatedSecurityFixes: {
      enabled: automatedSecurityFixesData?.enabled ?? false
    }
  };

  // Calculate score
  const score = calculateSecurityScore(auditResult);

  if (verbose) {
    console.log(`    ✓ Score: ${score}/100 | Dependabot: ${dependabotSummary.total} | Code Scanning: ${codeScanningAlerts.length} | Secrets: ${secretScanningAlerts.length}`);
  }

  return {
    ...auditResult,
    score
  };
}

/** Categorize a caught error into a structured PipelineError. */
function categorizePipelineError(repo: string, error: unknown): PipelineError {
  const message = error instanceof Error ? error.message : String(error);

  // RateLimitError has parsed resetAt/remaining/limit from response headers
  if (error instanceof Error && error.name === 'RateLimitError') {
    const err = error as Error & { resetAt?: number; remaining?: number; limit?: number };
    const errorMsg = (err.remaining !== undefined && err.limit !== undefined)
      ? `GitHub API rate limit exceeded (${err.remaining}/${err.limit} calls remaining)`
      : 'GitHub API rate limit exceeded';
    let suggestion: string;
    if (err.resetAt) {
      const resetTime = new Date(err.resetAt).toLocaleTimeString();
      const minutesLeft = Math.max(1, Math.ceil((err.resetAt - Date.now()) / 60000));
      suggestion = `Rate limit resets at ${resetTime} (in ~${minutesLeft} minutes). Wait for reset or use a different token.`;
    } else {
      suggestion = 'GitHub API rate limit exceeded. Wait a few minutes or use a token with higher limits.';
    }
    return { repo, category: 'rate_limit', message: errorMsg, suggestion };
  }

  if (message.includes('401')) {
    return { repo, category: 'auth', message: 'GitHub API error 401', suggestion: 'Check your GITHUB_TOKEN in .env — it may be expired or missing.' };
  }
  if (message.includes('403') || message.toLowerCase().includes('rate limit')) {
    return { repo, category: 'rate_limit', message: message.toLowerCase().includes('rate limit') ? 'GitHub API rate limit exceeded' : 'GitHub API error 403', suggestion: 'GitHub API rate limit exceeded. Wait a few minutes or use a token with higher limits.' };
  }
  if (message.includes('404') || message.includes('Not Found')) {
    return { repo, category: 'not_found', message: 'Repository not found (404)', suggestion: 'Verify the repo exists and you have access.' };
  }
  return { repo, category: 'api_error', message, suggestion: 'Check the error message for details and verify your GitHub token has the required permissions.' };
}

/**
 * Audit multiple repositories
 * Returns aggregate report with summary statistics
 */
export async function auditRepos(
  client: GitHubClient,
  repos: string[],
  options?: AuditOptions
): Promise<SecurityAuditReport> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`\nAuditing ${repos.length} repositories...`);
  }

  const auditResults: RepoSecurityAudit[] = [];
  const errors: PipelineError[] = [];

  for (const repoFullName of repos) {
    const [owner, repo] = repoFullName.split('/');
    
    if (!owner || !repo) {
      if (verbose) {
        console.log(`  ⚠ Skipping invalid repo name: ${repoFullName}`);
      }
      continue;
    }

    try {
      const audit = await auditRepo(client, owner, repo, options);
      auditResults.push(audit);
    } catch (error) {
      if (verbose) {
        console.log(`  ✗ Failed to audit ${owner}/${repo}: ${(error as Error).message}`);
      }
      errors.push(categorizePipelineError(repoFullName, error));
    }
  }

  // Calculate summary statistics
  const totalRepos = auditResults.length;
  const avgScore = totalRepos > 0
    ? auditResults.reduce((sum, a) => sum + a.score, 0) / totalRepos
    : 0;
  const totalDependabotAlerts = auditResults.reduce((sum, a) => sum + a.dependabotAlerts.total, 0);
  const totalCodeScanningAlerts = auditResults.reduce((sum, a) => sum + a.codeScanningAlerts.total, 0);
  const totalSecretScanningAlerts = auditResults.reduce((sum, a) => sum + a.secretScanningAlerts.total, 0);
  const reposWithoutBranchProtection = auditResults.filter(a => !a.branchProtection.protected).length;

  return {
    repos: auditResults,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      totalRepos,
      avgScore: Math.round(avgScore * 100) / 100,
      totalDependabotAlerts,
      totalCodeScanningAlerts,
      totalSecretScanningAlerts,
      reposWithoutBranchProtection,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Generate human-readable summary from audit report
 */
export function generateAuditSummary(report: SecurityAuditReport): string {
  const { summary, repos } = report;
  
  let output = '# Security Audit Summary\n\n';
  output += `**Generated:** ${new Date(summary.timestamp).toLocaleString()}\n\n`;
  output += `## Overview\n\n`;
  output += `- **Total Repositories:** ${summary.totalRepos}\n`;
  output += `- **Average Security Score:** ${summary.avgScore}/100\n`;
  output += `- **Total Dependabot Alerts:** ${summary.totalDependabotAlerts}\n`;
  output += `- **Total Code Scanning Alerts:** ${summary.totalCodeScanningAlerts}\n`;
  output += `- **Total Secret Scanning Alerts:** ${summary.totalSecretScanningAlerts}\n`;
  output += `- **Repos Without Branch Protection:** ${summary.reposWithoutBranchProtection}\n\n`;

  output += `## Repository Details\n\n`;
  
  // Sort by score (lowest first - highest priority)
  const sortedRepos = [...repos].sort((a, b) => a.score - b.score);

  for (const repo of sortedRepos) {
    output += `### ${repo.owner}/${repo.repo} (Score: ${repo.score}/100)\n\n`;
    
    // Dependabot alerts
    if (repo.dependabotAlerts.total > 0) {
      output += `**Dependabot Alerts:** ${repo.dependabotAlerts.total} total`;
      const severities: string[] = [];
      if (repo.dependabotAlerts.critical > 0) severities.push(`${repo.dependabotAlerts.critical} critical`);
      if (repo.dependabotAlerts.high > 0) severities.push(`${repo.dependabotAlerts.high} high`);
      if (repo.dependabotAlerts.medium > 0) severities.push(`${repo.dependabotAlerts.medium} medium`);
      if (repo.dependabotAlerts.low > 0) severities.push(`${repo.dependabotAlerts.low} low`);
      if (severities.length > 0) {
        output += ` (${severities.join(', ')})`;
      }
      output += '\n\n';
    }

    // Code scanning alerts
    if (repo.codeScanningAlerts.total > 0) {
      output += `**Code Scanning Alerts:** ${repo.codeScanningAlerts.total}\n\n`;
    } else if (!repo.codeScanningAlerts.enabled) {
      output += `**Code Scanning:** Not enabled\n\n`;
    }

    // Secret scanning alerts
    if (repo.secretScanningAlerts.total > 0) {
      output += `**Secret Scanning Alerts:** ${repo.secretScanningAlerts.total}\n\n`;
    } else if (!repo.secretScanningAlerts.enabled) {
      output += `**Secret Scanning:** Not enabled\n\n`;
    }

    // Security advisories
    if (repo.securityAdvisories.total > 0) {
      output += `**Security Advisories:** ${repo.securityAdvisories.total}\n\n`;
    }

    // Branch protection
    if (!repo.branchProtection.protected) {
      output += `**Branch Protection:** ⚠️ Not enabled on ${repo.branchProtection.defaultBranch}\n\n`;
    }

    // Automated security fixes
    if (!repo.automatedSecurityFixes.enabled) {
      output += `**Automated Security Fixes:** ⚠️ Not enabled\n\n`;
    }

    output += '---\n\n';
  }

  return output;
}
