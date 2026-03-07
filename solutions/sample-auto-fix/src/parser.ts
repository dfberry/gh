/**
 * Parser — extracts fixable findings from upstream solution outputs.
 */

import type {
  RemediationIssuesReport,
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
  FixableFinding,
  FixCategory,
} from './types.js';

/**
 * Extract fixable findings from all input sources.
 */
export function extractFixableFindings(
  remediationReport?: RemediationIssuesReport,
  securityReport?: SecurityAuditReport,
  healthReport?: HealthCheckReport,
  azureReport?: AzureBestPracticesReport,
): FixableFinding[] {
  const findings: FixableFinding[] = [];

  // Process security audit report
  if (securityReport?.repos) {
    for (const repo of securityReport.repos) {
      if (repo.isFork) continue;

      const missingFiles: string[] = [];
      
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

  // Process health check report
  if (healthReport?.repos) {
    for (const repo of healthReport.repos) {
      if (repo.isFork) continue;

      const missingFiles: string[] = [];

      if (repo.checks?.envExample?.pass === false) {
        missingFiles.push('.env.example');
      }
      if (repo.checks?.securityMd?.pass === false && !missingFiles.includes('SECURITY.md')) {
        missingFiles.push('SECURITY.md');
      }
      if (repo.checks?.dependabotYml?.pass === false && !missingFiles.includes('.github/dependabot.yml')) {
        missingFiles.push('.github/dependabot.yml');
      }

      if (missingFiles.length > 0) {
        // Check if we already have a finding for this repo from security report
        const existingFinding = findings.find(
          f => f.owner === repo.owner && f.repo === repo.repo && f.category === 'missing-security-files'
        );

        if (existingFinding) {
          // Merge missing files (avoid duplicates)
          for (const file of missingFiles) {
            if (!existingFinding.missingFiles.includes(file)) {
              existingFinding.missingFiles.push(file);
            }
          }
        } else {
          findings.push({
            owner: repo.owner,
            repo: repo.repo,
            category: 'missing-security-files',
            missingFiles,
            source: 'health',
          });
        }
      }
    }
  }

  // Process Azure best practices report
  if (azureReport?.repos) {
    for (const repo of azureReport.repos) {
      if (repo.isFork) continue;

      const missingFiles: string[] = [];

      if (repo.checks?.azdYaml?.pass === false) {
        missingFiles.push('azure.yaml');
      }

      if (missingFiles.length > 0) {
        findings.push({
          owner: repo.owner,
          repo: repo.repo,
          category: 'missing-azure-config',
          missingFiles,
          source: 'azure',
        });
      }
    }
  }

  return findings;
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
