/**
 * Parser — extracts fixable findings from upstream solution outputs.
 *
 * Handles both the actual report shapes (checks as arrays of
 * ReportCheckResult) and the data shapes from upstream solutions.
 */

import type {
  RemediationIssuesReport,
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
  FixableFinding,
  FixCategory,
  ClassifiedFinding,
  FindingFixability,
  ReportCheckResult,
} from './types.js';

// ─── Signal → auto-fixable file mapping ──────────────────────────────────

const AUTO_FIXABLE_SIGNALS: Record<string, { file: string; category: FixCategory }> = {
  // Hyphenated signal names (actual upstream format)
  'security-policy-present': { file: 'SECURITY.md', category: 'missing-security-files' },
  'env-example-present': { file: '.env.example', category: 'missing-security-files' },
  'azd-yaml-present': { file: 'azure.yaml', category: 'missing-azure-config' },
  // Underscore variants (test/alt format)
  'security_policy_present': { file: 'SECURITY.md', category: 'missing-security-files' },
  'env_example_present': { file: '.env.example', category: 'missing-security-files' },
  'azd_yaml_present': { file: 'azure.yaml', category: 'missing-azure-config' },
};

// ─── Helper: find a check in array-style checks ─────────────────────────

function findCheckInArray(
  checks: ReportCheckResult[] | undefined,
  signal: string,
): ReportCheckResult | undefined {
  if (!checks || !Array.isArray(checks)) return undefined;
  return checks.find(c => c.signal === signal);
}

function getFailingChecks(
  checks: ReportCheckResult[] | undefined,
): ReportCheckResult[] {
  if (!checks || !Array.isArray(checks)) return [];
  return checks.filter(c => c.passed === false);
}

// ─── Core: Extract fixable findings (template-based auto-fixes) ─────────

/**
 * Extract fixable findings from all input sources.
 *
 * Handles the actual upstream JSON shapes:
 * - Security audit: branchProtection.protected, automatedSecurityFixes.enabled, etc.
 * - Health check: checks[] array with signal/passed fields
 * - Azure BP: checks[] array with signal/passed fields
 */
export function extractFixableFindings(
  remediationReport?: RemediationIssuesReport,
  securityReport?: SecurityAuditReport,
  healthReport?: HealthCheckReport,
  azureReport?: AzureBestPracticesReport,
): FixableFinding[] {
  const findings: FixableFinding[] = [];

  // Process security audit report — look for legacy securityFiles field
  if (securityReport?.repos) {
    for (const repo of securityReport.repos) {
      if (repo.isFork) continue;

      const missingFiles: string[] = [];

      // Legacy format: securityFiles object
      if (repo.securityFiles?.securityMd === false) {
        missingFiles.push('SECURITY.md');
      }
      if (repo.securityFiles?.dependabotYml === false) {
        missingFiles.push('.github/dependabot.yml');
      }

      if (missingFiles.length > 0) {
        findings.push({
          owner: repo.owner,
          repo: repo.repo,
          category: 'missing-security-files',
          missingFiles,
          source: 'security',
        });
      }
    }
  }

  // Process health check report — checks is an array of ReportCheckResult
  if (healthReport?.repos) {
    for (const repo of healthReport.repos) {
      if (repo.isFork) continue;

      const missingFiles: string[] = [];

      if (repo.checks && Array.isArray(repo.checks)) {
        for (const [signal, mapping] of Object.entries(AUTO_FIXABLE_SIGNALS)) {
          const check = findCheckInArray(repo.checks, signal);
          if (check && !check.passed) {
            missingFiles.push(mapping.file);
          }
        }
      }

      if (missingFiles.length > 0) {
        const existingFinding = findings.find(
          f => f.owner === repo.owner && f.repo === repo.repo && f.category === 'missing-security-files'
        );

        if (existingFinding) {
          for (const file of missingFiles) {
            if (!existingFinding.missingFiles.includes(file)) {
              existingFinding.missingFiles.push(file);
            }
          }
        } else {
          const category = missingFiles.some(f => f === 'azure.yaml')
            ? 'missing-azure-config' as FixCategory
            : 'missing-security-files' as FixCategory;

          findings.push({
            owner: repo.owner,
            repo: repo.repo,
            category,
            missingFiles,
            source: 'health',
          });
        }
      }
    }
  }

  // Process Azure best practices report — checks is an array
  if (azureReport?.repos) {
    for (const repo of azureReport.repos) {
      if (repo.isFork) continue;

      const securityMissing: string[] = [];
      const azureMissing: string[] = [];

      if (repo.checks && Array.isArray(repo.checks)) {
        for (const [signal, mapping] of Object.entries(AUTO_FIXABLE_SIGNALS)) {
          const check = findCheckInArray(repo.checks, signal);
          if (check && !check.passed) {
            if (mapping.category === 'missing-azure-config') {
              azureMissing.push(mapping.file);
            } else {
              securityMissing.push(mapping.file);
            }
          }
        }
      }

      // Add security file findings (merge with existing)
      if (securityMissing.length > 0) {
        const existing = findings.find(
          f => f.owner === repo.owner && f.repo === repo.repo && f.category === 'missing-security-files'
        );
        if (existing) {
          for (const file of securityMissing) {
            if (!existing.missingFiles.includes(file)) {
              existing.missingFiles.push(file);
            }
          }
        } else {
          findings.push({
            owner: repo.owner,
            repo: repo.repo,
            category: 'missing-security-files',
            missingFiles: securityMissing,
            source: 'azure',
          });
        }
      }

      // Add azure config findings
      if (azureMissing.length > 0) {
        const existing = findings.find(
          f => f.owner === repo.owner && f.repo === repo.repo && f.category === 'missing-azure-config'
        );
        if (existing) {
          for (const file of azureMissing) {
            if (!existing.missingFiles.includes(file)) {
              existing.missingFiles.push(file);
            }
          }
        } else {
          findings.push({
            owner: repo.owner,
            repo: repo.repo,
            category: 'missing-azure-config',
            missingFiles: azureMissing,
            source: 'azure',
          });
        }
      }
    }
  }

  return findings;
}

// ─── Comprehensive: Extract ALL findings classified by fixability ────────

/**
 * Extract ALL findings from all reports, classified as auto-fixable,
 * manual-action, or informational. This provides the complete picture
 * that Dina requested — nothing is silently dropped.
 */
export function extractAllFindings(
  remediationReport?: RemediationIssuesReport,
  securityReport?: SecurityAuditReport,
  healthReport?: HealthCheckReport,
  azureReport?: AzureBestPracticesReport,
): ClassifiedFinding[] {
  const findings: ClassifiedFinding[] = [];

  // ── Security audit findings ───────────────────────────────────────────
  if (securityReport?.repos) {
    for (const repo of securityReport.repos) {
      if (repo.isFork) continue;
      const { owner } = repo;
      const repoName = repo.repo;

      // Branch protection
      const isProtected = repo.branchProtection?.protected ?? repo.branchProtection?.enabled;
      if (isProtected === false) {
        findings.push({
          owner, repo: repoName,
          source: 'security',
          signal: 'no-branch-protection',
          description: 'Default branch has no branch protection rules',
          severity: 'medium',
          fixability: 'manual-action',
          manualAction: 'Enable branch protection in repository Settings → Branches → Add rule for the default branch',
        });
      }

      // Automated security fixes
      if (repo.automatedSecurityFixes?.enabled === false) {
        findings.push({
          owner, repo: repoName,
          source: 'security',
          signal: 'no-automated-security-fixes',
          description: 'Automated security fixes (Dependabot auto-merge) not enabled',
          severity: 'low',
          fixability: 'manual-action',
          manualAction: 'Enable in Settings → Code security and analysis → Dependabot security updates',
        });
      }

      // Dependabot alerts
      if (repo.dependabotAlerts) {
        const { critical, high, medium, low } = repo.dependabotAlerts;
        if (critical > 0) {
          findings.push({
            owner, repo: repoName,
            source: 'security',
            signal: 'dependabot-critical',
            description: `${critical} critical Dependabot alert(s)`,
            severity: 'critical',
            fixability: 'manual-action',
            manualAction: 'Review and resolve critical dependency vulnerabilities in the Security tab → Dependabot alerts',
          });
        }
        if (high > 0) {
          findings.push({
            owner, repo: repoName,
            source: 'security',
            signal: 'dependabot-high',
            description: `${high} high-severity Dependabot alert(s)`,
            severity: 'high',
            fixability: 'manual-action',
            manualAction: 'Review and resolve high-severity dependency vulnerabilities',
          });
        }
        if (medium > 0 || low > 0) {
          findings.push({
            owner, repo: repoName,
            source: 'security',
            signal: 'dependabot-medium-low',
            description: `${medium} medium + ${low} low Dependabot alert(s)`,
            severity: 'medium',
            fixability: 'informational',
          });
        }
      }

      // Code scanning
      if (repo.codeScanningAlerts && repo.codeScanningAlerts.total > 0) {
        findings.push({
          owner, repo: repoName,
          source: 'security',
          signal: 'code-scanning-alerts',
          description: `${repo.codeScanningAlerts.total} code scanning alert(s)`,
          severity: 'high',
          fixability: 'manual-action',
          manualAction: 'Review code scanning alerts in the Security tab',
        });
      }

      // Secret scanning
      if (repo.secretScanningAlerts && repo.secretScanningAlerts.total > 0) {
        findings.push({
          owner, repo: repoName,
          source: 'security',
          signal: 'secret-scanning-alerts',
          description: `${repo.secretScanningAlerts.total} secret scanning alert(s) — possible credential exposure`,
          severity: 'critical',
          fixability: 'manual-action',
          manualAction: 'Rotate exposed credentials immediately and review in Security tab → Secret scanning',
        });
      }
    }
  }

  // ── Health check findings ─────────────────────────────────────────────
  if (healthReport?.repos) {
    for (const repo of healthReport.repos) {
      if (repo.isFork) continue;
      const { owner } = repo;
      const repoName = repo.repo;

      if (repo.checks && Array.isArray(repo.checks)) {
        const failing = getFailingChecks(repo.checks);
        for (const check of failing) {
          const autoFixMapping = AUTO_FIXABLE_SIGNALS[check.signal];
          const fixability: FindingFixability = autoFixMapping ? 'auto-fixable' : 'manual-action';
          const severity = mapWeightToSeverity(check.weight);

          findings.push({
            owner, repo: repoName,
            source: 'health',
            signal: check.signal,
            description: check.detail || `Health check failed: ${check.signal} (${check.dimension})`,
            severity,
            fixability,
            manualAction: autoFixMapping
              ? undefined
              : `Address failing health check: ${check.signal} in dimension "${check.dimension}"`,
          });
        }
      }
    }
  }

  // ── Azure best practices findings ─────────────────────────────────────
  if (azureReport?.repos) {
    for (const repo of azureReport.repos) {
      if (repo.isFork) continue;
      const { owner } = repo;
      const repoName = repo.repo;

      if (repo.checks && Array.isArray(repo.checks)) {
        const failing = getFailingChecks(repo.checks);
        for (const check of failing) {
          const autoFixMapping = AUTO_FIXABLE_SIGNALS[check.signal];
          const fixability: FindingFixability = autoFixMapping ? 'auto-fixable' : 'manual-action';
          const severity = check.severity ?? mapWeightToSeverity(check.weight);

          findings.push({
            owner, repo: repoName,
            source: 'azure',
            signal: check.signal,
            description: check.detail || `Azure BP check failed: ${check.signal} (${check.dimension})`,
            severity,
            fixability,
            manualAction: autoFixMapping
              ? undefined
              : check.recommendation || `Address failing Azure best practice: ${check.signal}`,
          });
        }
      }
    }
  }

  // ── Remediation findings ──────────────────────────────────────────────
  if (remediationReport?.planned) {
    for (const item of remediationReport.planned) {
      const [owner, repoName] = item.repo.includes('/')
        ? item.repo.split('/')
        : [item.owner ?? 'unknown', item.repoName ?? item.repo];

      findings.push({
        owner,
        repo: repoName,
        source: 'remediation',
        signal: item.findingType,
        description: item.title || `Remediation planned: ${item.findingType}`,
        severity: (item.severity as ClassifiedFinding['severity']) || 'medium',
        fixability: 'informational',
      });
    }
  }
  if (remediationReport?.created) {
    for (const item of remediationReport.created) {
      const [owner, repoName] = item.repo.includes('/')
        ? item.repo.split('/')
        : [item.owner ?? 'unknown', item.repoName ?? item.repo];

      findings.push({
        owner,
        repo: repoName,
        source: 'remediation',
        signal: item.findingType,
        description: `Remediation issue created: #${item.issueNumber}`,
        severity: (item.severity as ClassifiedFinding['severity']) || 'medium',
        fixability: 'informational',
      });
    }
  }

  return findings;
}

/** Map health/azure check weight to severity. */
function mapWeightToSeverity(weight: number): ClassifiedFinding['severity'] {
  if (weight >= 8) return 'high';
  if (weight >= 5) return 'medium';
  if (weight >= 3) return 'low';
  return 'info';
}

/**
 * Filter findings by category.
 */
export function filterByCategory(
  findings: FixableFinding[],
  categories: FixCategory[],
): FixableFinding[] {
  if (categories.length === 0) return findings;
  return findings.filter(f => categories.includes(f.category));
}

/**
 * Group findings by repository.
 */
export function groupByRepo(
  findings: FixableFinding[],
): Map<string, FixableFinding[]> {
  const grouped = new Map<string, FixableFinding[]>();

  for (const finding of findings) {
    const key = `${finding.owner}/${finding.repo}`;
    const existing = grouped.get(key) || [];
    existing.push(finding);
    grouped.set(key, existing);
  }

  return grouped;
}
