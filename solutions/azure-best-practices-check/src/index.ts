/**
 * Orchestrator — fetches repo data via github-rest, runs all rules, aggregates report.
 *
 * Uses Promise.allSettled for graceful degradation (same pattern as sample-health-check).
 * Sequential per-repo for rate-limit safety.
 */

import type { GitHubClient, ContentItem } from 'github-rest';
import { contents } from 'github-rest';

import type {
  RepoAzureBPCheck,
  AzureBestPracticesReport,
  AzureBPCheckResult,
  PipelineError,
  RepoFileData,
  PackageJsonData,
  RootEntry,
} from './types.js';

import {
  checkAzureIdentityPresent,
  checkNoDeprecatedAzureSDK,
  checkUsesModernAzureSDK,
  checkAzureTypesPresent,
  checkIaCPresent,
  checkIaCNoHardcodedSecrets,
  checkIaCParameterized,
  checkAzdYamlPresent,
  checkEnvExamplePresent,
  checkSecurityPolicyPresent,
  checkWorkflowFederatedAuth,
  checkWorkflowNoHardcodedCreds,
  checkWorkflowCurrentActions,
  checkNoConnectionStringsInSource,
  checkManagedIdentityDocumented,
} from './rules.js';

import { calculateScore, generateDimensionSummary, gradeFromScore } from './scoring.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type {
  AzureBestPracticesReport,
  RepoAzureBPCheck,
  AzureBPCheckResult,
  PipelineError,
  DimensionSummary,
} from './types.js';

export { gradeFromScore, calculateScore, generateDimensionSummary, DIMENSION_WEIGHTS } from './scoring.js';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface CheckOptions {
  verbose?: boolean;
}

// ─── File Fetching ───────────────────────────────────────────────────────────

const IAC_EXTENSIONS = ['.bicep', '.tf'];
const IAC_FILENAMES = ['azuredeploy.json', 'main.bicep', 'main.tf'];
const WORKFLOW_DIR = '.github/workflows';

/**
 * Fetch all files needed for analysis from a single repo.
 * Uses github-rest contents API — 5-9 calls per repo.
 */
async function fetchRepoFileData(
  client: GitHubClient,
  owner: string,
  repo: string,
  verbose: boolean,
): Promise<{ data: RepoFileData; filesAnalyzed: string[] }> {
  const filesAnalyzed: string[] = [];

  // 1. Get root contents
  let rootEntries: RootEntry[] = [];
  try {
    const rootItems = await contents.getRootContents(client, owner, repo);
    rootEntries = (rootItems as ContentItem[]).map(item => ({
      name: item.name,
      type: item.type as 'file' | 'dir',
      path: item.path,
    }));
    filesAnalyzed.push('/');
  } catch {
    if (verbose) console.log(`    ⚠ Could not read root contents`);
  }

  // 2. Fetch package.json
  let packageJson: PackageJsonData | null = null;
  try {
    const content = await contents.getDecodedFileContent(client, owner, repo, 'package.json');
    if (content) {
      packageJson = JSON.parse(content) as PackageJsonData;
      filesAnalyzed.push('package.json');
    }
  } catch {
    if (verbose) console.log(`    ⚠ Could not read package.json`);
  }

  // 3. Fetch IaC files (first .bicep or .tf found, or azuredeploy.json)
  const iacFiles: Array<{ path: string; content: string }> = [];
  const iacCandidates = rootEntries.filter(e =>
    IAC_EXTENSIONS.some(ext => e.name.endsWith(ext)) ||
    IAC_FILENAMES.includes(e.name),
  );
  // Also check infra/ directory
  const hasInfraDir = rootEntries.some(e => e.name === 'infra' && e.type === 'dir');

  for (const candidate of iacCandidates.slice(0, 3)) {
    try {
      const content = await contents.getDecodedFileContent(client, owner, repo, candidate.path);
      if (content) {
        iacFiles.push({ path: candidate.path, content });
        filesAnalyzed.push(candidate.path);
      }
    } catch {
      if (verbose) console.log(`    ⚠ Could not read IaC file: ${candidate.path}`);
    }
  }

  // If infra/ dir exists but no root-level IaC, try infra/main.bicep
  if (hasInfraDir && iacFiles.length === 0) {
    try {
      const content = await contents.getDecodedFileContent(client, owner, repo, 'infra/main.bicep');
      if (content) {
        iacFiles.push({ path: 'infra/main.bicep', content });
        filesAnalyzed.push('infra/main.bicep');
      }
    } catch {
      // Try infra/main.tf
      try {
        const content = await contents.getDecodedFileContent(client, owner, repo, 'infra/main.tf');
        if (content) {
          iacFiles.push({ path: 'infra/main.tf', content });
          filesAnalyzed.push('infra/main.tf');
        }
      } catch {
        if (verbose) console.log(`    ⚠ Could not read infra/ IaC files`);
      }
    }
  }

  // 4. Fetch workflow files
  const workflowFiles: Array<{ path: string; content: string }> = [];
  const hasWorkflowDir = rootEntries.some(e => e.name === '.github' && e.type === 'dir');

  if (hasWorkflowDir) {
    try {
      const workflowItems = await contents.getRootContents(client, owner, repo) as ContentItem[];
      // Need to fetch .github/workflows directory listing
      const wfDirContent = await client.get<ContentItem[]>(
        `/repos/${owner}/${repo}/contents/${WORKFLOW_DIR}`,
      );
      const ymlFiles = (wfDirContent ?? []).filter(
        (f: ContentItem) => f.name.endsWith('.yml') || f.name.endsWith('.yaml'),
      );

      for (const wf of ymlFiles.slice(0, 3)) {
        try {
          const content = await contents.getDecodedFileContent(client, owner, repo, wf.path);
          if (content) {
            workflowFiles.push({ path: wf.path, content });
            filesAnalyzed.push(wf.path);
          }
        } catch {
          if (verbose) console.log(`    ⚠ Could not read workflow: ${wf.path}`);
        }
      }
    } catch {
      if (verbose) console.log(`    ⚠ Could not list workflow directory`);
    }
  }

  // 5. Fetch README.md
  let readmeContent: string | null = null;
  try {
    readmeContent = await contents.getDecodedFileContent(client, owner, repo, 'README.md');
    if (readmeContent) filesAnalyzed.push('README.md');
  } catch {
    if (verbose) console.log(`    ⚠ Could not read README.md`);
  }

  // 6. Check for presence of config files
  const hasEnvExample = rootEntries.some(e =>
    e.name === '.env.example' || e.name === '.env.sample',
  );
  const hasAzureYaml = rootEntries.some(e => e.name === 'azure.yaml');

  // Check for SECURITY.md in root or .github/
  let hasSecurityPolicy = rootEntries.some(e =>
    e.name.toUpperCase() === 'SECURITY.MD',
  );
  if (!hasSecurityPolicy) {
    try {
      hasSecurityPolicy = await contents.fileExists(client, owner, repo, '.github/SECURITY.md');
    } catch {
      // ignore
    }
  }

  return {
    data: {
      rootEntries,
      packageJson,
      iacFiles,
      workflowFiles,
      readmeContent,
      hasEnvExample,
      hasSecurityPolicy,
      hasAzureYaml,
    },
    filesAnalyzed,
  };
}

// ─── Rule Runner ─────────────────────────────────────────────────────────────

/** Run all 15 checks against fetched file data */
function runAllChecks(data: RepoFileData): AzureBPCheckResult[] {
  const checks: AzureBPCheckResult[] = [];
  const emptyPkg: PackageJsonData = { dependencies: {}, devDependencies: {} };
  const pkg = data.packageJson ?? emptyPkg;

  // azure-sdk dimension (4 checks)
  checks.push(checkAzureIdentityPresent(pkg));
  checks.push(checkNoDeprecatedAzureSDK(pkg));
  checks.push(checkUsesModernAzureSDK(pkg));
  checks.push(checkAzureTypesPresent(pkg));

  // iac dimension (3 checks)
  checks.push(checkIaCPresent(data));
  checks.push(checkIaCNoHardcodedSecrets(data.iacFiles));
  checks.push(checkIaCParameterized(data.iacFiles));

  // config dimension (3 checks)
  checks.push(checkAzdYamlPresent(data));
  checks.push(checkEnvExamplePresent(data));
  checks.push(checkSecurityPolicyPresent(data));

  // ci-cd dimension (3 checks)
  checks.push(checkWorkflowFederatedAuth(data.workflowFiles));
  checks.push(checkWorkflowNoHardcodedCreds(data.workflowFiles));
  checks.push(checkWorkflowCurrentActions(data.workflowFiles));

  // security dimension (2 checks) — source files = workflow + IaC + any .ts/.js
  const sourceFiles = [...data.workflowFiles, ...data.iacFiles];
  checks.push(checkNoConnectionStringsInSource(sourceFiles));
  checks.push(checkManagedIdentityDocumented(data.readmeContent));

  return checks;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/** Check a single repo for Azure best practices */
export async function checkRepoBestPractices(
  client: GitHubClient,
  owner: string,
  repo: string,
  options?: CheckOptions,
): Promise<RepoAzureBPCheck> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`  Checking Azure best practices for ${owner}/${repo}...`);
  }

  const { data, filesAnalyzed } = await fetchRepoFileData(client, owner, repo, verbose);
  const checks = runAllChecks(data);
  const { score, grade } = calculateScore(checks);
  const dimensions = generateDimensionSummary(checks);

  if (verbose) {
    const passedCount = checks.filter(c => c.passed).length;
    console.log(`    ✓ Score: ${score}/100 (${grade}) | ${passedCount}/${checks.length} checks passed`);
  }

  return {
    owner,
    repo,
    checkedAt: new Date().toISOString(),
    score,
    grade,
    checks,
    dimensions,
    filesAnalyzed,
  };
}

/** Categorize a caught error into a structured PipelineError. */
function categorizePipelineError(repoFullName: string, error: unknown): PipelineError {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof Error && error.name === 'RateLimitError') {
    return {
      repo: repoFullName,
      category: 'rate_limit',
      message: 'GitHub API rate limit exceeded',
      suggestion: 'Wait for reset or use a token with higher limits.',
    };
  }
  if (message.includes('401')) {
    return { repo: repoFullName, category: 'auth', message: 'GitHub API error 401', suggestion: 'Check your GITHUB_TOKEN — it may be expired or missing.' };
  }
  if (message.includes('403') || message.toLowerCase().includes('rate limit')) {
    return { repo: repoFullName, category: 'rate_limit', message: 'GitHub API rate limit or forbidden', suggestion: 'Wait a few minutes or use a token with higher limits.' };
  }
  if (message.includes('404') || message.includes('Not Found')) {
    return { repo: repoFullName, category: 'not_found', message: 'Repository not found (404)', suggestion: 'Verify the repo exists and you have access.' };
  }
  return { repo: repoFullName, category: 'api_error', message, suggestion: 'Check the error message and verify your GitHub token permissions.' };
}

/**
 * Check multiple repos and produce an aggregate report.
 * Runs sequentially for rate-limit safety.
 */
export async function checkReposBestPractices(
  client: GitHubClient,
  repos: string[],
  options?: CheckOptions,
): Promise<AzureBestPracticesReport> {
  const verbose = options?.verbose ?? false;

  if (verbose) {
    console.log(`\nChecking Azure best practices for ${repos.length} repositories...`);
  }

  const results: RepoAzureBPCheck[] = [];
  const errors: PipelineError[] = [];

  for (const repoFullName of repos) {
    const [owner, repo] = repoFullName.split('/');

    if (!owner || !repo) {
      if (verbose) console.log(`  ⚠ Skipping invalid repo name: ${repoFullName}`);
      continue;
    }

    try {
      const result = await checkRepoBestPractices(client, owner, repo, options);
      results.push(result);
    } catch (error) {
      if (verbose) {
        console.log(`  ✗ Failed to check ${owner}/${repo}: ${(error as Error).message}`);
      }
      errors.push(categorizePipelineError(repoFullName, error));
    }
  }

  // Summary statistics
  const totalRepos = results.length;
  const avgScore = totalRepos > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / totalRepos * 100) / 100
    : 0;
  const avgGrade = gradeFromScore(avgScore);

  // Count critical findings across all repos
  const criticalFindings = results.reduce((sum, r) =>
    sum + r.checks.filter(c => !c.passed && c.severity === 'critical').length, 0,
  );

  // Find worst dimension by average pass rate
  const dimAccum: Record<string, { totalRate: number; count: number }> = {};
  for (const r of results) {
    for (const [dim, summary] of Object.entries(r.dimensions)) {
      if (!dimAccum[dim]) dimAccum[dim] = { totalRate: 0, count: 0 };
      dimAccum[dim].totalRate += summary.passRate;
      dimAccum[dim].count += 1;
    }
  }
  let worstDimension = 'N/A';
  let worstRate = Infinity;
  for (const [dim, data] of Object.entries(dimAccum)) {
    const avg = data.count > 0 ? data.totalRate / data.count : 0;
    if (avg < worstRate) {
      worstRate = avg;
      worstDimension = dim;
    }
  }

  return {
    repos: results,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      totalRepos,
      avgScore,
      avgGrade,
      worstDimension,
      criticalFindings,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Markdown Report ─────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  'azure-sdk': 'Azure SDK Usage',
  'iac': 'Infrastructure as Code',
  'config': 'Configuration',
  'ci-cd': 'CI/CD Patterns',
  'security': 'Security Patterns',
};

/** Generate human-readable markdown from an Azure best practices report. */
export function generateMarkdownReport(report: AzureBestPracticesReport): string {
  const { summary, repos: repoResults } = report;

  let output = '# Azure Best Practices Report\n\n';
  output += `**Generated:** ${summary.timestamp}\n\n`;

  output += '## Summary\n\n';
  output += `- **Total Repositories:** ${summary.totalRepos}\n`;
  output += `- **Average Score:** ${summary.avgScore}/100 (${summary.avgGrade})\n`;
  output += `- **Weakest Dimension:** ${DIMENSION_LABELS[summary.worstDimension] ?? summary.worstDimension}\n`;
  output += `- **Critical Findings:** ${summary.criticalFindings}\n\n`;

  output += '## Repository Details\n\n';

  // Sort by score ascending (needs attention first)
  const sorted = [...repoResults].sort((a, b) => a.score - b.score);

  for (const r of sorted) {
    output += `### ${r.owner}/${r.repo} (Score: ${r.score}/100 — ${r.grade})\n\n`;
    output += `Files analyzed: ${r.filesAnalyzed.join(', ') || 'none'}\n\n`;
    output += '| Dimension | Earned | Possible | Pass Rate |\n';
    output += '|-----------|--------|----------|----------|\n';

    for (const [dim, info] of Object.entries(r.dimensions)) {
      const label = DIMENSION_LABELS[dim] ?? dim;
      const emoji = info.passRate >= 0.8 ? '✅' : info.passRate >= 0.5 ? '⚠️' : '❌';
      output += `| ${label} | ${info.earned} | ${info.possible} | ${Math.round(info.passRate * 100)}% ${emoji} |\n`;
    }
    output += '\n';

    const failing = r.checks.filter(c => !c.passed);
    if (failing.length > 0) {
      output += '**Failing Checks:**\n';
      for (const check of failing) {
        const sevEmoji = check.severity === 'critical' ? '🔴' : check.severity === 'high' ? '🟠' : '⚠️';
        output += `- ${sevEmoji} **[${check.severity.toUpperCase()}]** ${check.detail}`;
        if (check.recommendation) output += ` → _${check.recommendation}_`;
        output += '\n';
      }
      output += '\n';
    }

    output += '---\n\n';
  }

  // Error section
  if (report.errors && report.errors.length > 0) {
    output += '## Errors\n\n';
    for (const err of report.errors) {
      output += `- **${err.repo}** [${err.category}]: ${err.message}\n`;
    }
    output += '\n';
  }

  return output;
}
