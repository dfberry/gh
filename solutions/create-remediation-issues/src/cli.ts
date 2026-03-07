/**
 * CLI entry point for create-remediation-issues.
 *
 * Reads report JSON files, invokes the core remediation pipeline, writes output.
 *
 * Usage: create-remediation-issues [--security-input <path>] [--health-input <path>]
 *        [--out <dir>] [--dry-run] [--verbose]
 *
 * Output:
 *   Generates timestamped files in output directory:
 *   - {timestamp}-remediation.json (structured remediation data)
 *   - {timestamp}-remediation.md  (human-readable summary)
 */

import { GitHubClient } from 'github-rest';
import { createRemediationIssues } from './index.js';
import type { RemediationInput, RemediationOptions, RemediationResult, PipelineError } from './types.js';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_OUTPUT_DIR = 'generated/remediation-issues';

export interface CliArgs {
  securityInput?: string;
  healthInput?: string;
  /** Output directory for timestamped result files (default: generated/remediation-issues). */
  out?: string;
  dryRun?: boolean;
  securityScoreThreshold?: number;
  healthGradeThreshold?: string;
  extraLabels?: string[];
  verbose?: boolean;
}

function formatErrorLog(solutionName: string, errors: PipelineError[]): string {
  let output = `Pipeline Error Log — ${solutionName}\n`;
  output += `Generated: ${new Date().toISOString()}\n\n`;
  for (const err of errors) {
    const tag = err.category.toUpperCase();
    output += `[${tag}] ${err.repo}\n`;
    output += `  Error: ${err.message}\n`;
    output += `  Fix: ${err.suggestion}\n\n`;
  }
  return output;
}

/**
 * Parse CLI arguments from process.argv.
 */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--security-input':
        args.securityInput = argv[++i];
        break;
      case '--health-input':
        args.healthInput = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--security-score-threshold':
        args.securityScoreThreshold = Number(argv[++i]);
        break;
      case '--health-grade-threshold':
        args.healthGradeThreshold = argv[++i];
        break;
      case '--extra-labels':
        args.extraLabels = argv[++i].split(',');
        break;
      case '--verbose':
        args.verbose = true;
        break;
    }
  }

  return args;
}

/**
 * Generate a human-readable Markdown summary of remediation results.
 */
function generateRemediationSummary(result: RemediationResult): string {
  const lines: string[] = [];

  lines.push('# Remediation Issues Report');
  lines.push('');
  lines.push(`Generated: ${result.summary.timestamp}`);
  lines.push(`Mode: ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Planned | ${result.summary.totalPlanned} |`);
  lines.push(`| Total Created | ${result.summary.totalCreated} |`);
  lines.push(`| Total Skipped | ${result.summary.totalSkipped} |`);
  lines.push('');

  if (result.planned.length > 0) {
    lines.push('## Planned Issues');
    lines.push('');
    for (const issue of result.planned) {
      lines.push(`- **[${issue.severity.toUpperCase()}]** ${issue.owner}/${issue.repo}: ${issue.title}`);
    }
    lines.push('');
  }

  if (result.created.length > 0) {
    lines.push('## Created Issues');
    lines.push('');
    for (const issue of result.created) {
      lines.push(`- **[${issue.severity.toUpperCase()}]** ${issue.owner}/${issue.repo}: [${issue.title}](${issue.issueUrl})`);
    }
    lines.push('');
  }

  if (result.skipped.length > 0) {
    lines.push('## Skipped Issues');
    lines.push('');
    for (const issue of result.skipped) {
      lines.push(`- ${issue.owner}/${issue.repo}: ${issue.title} — _${issue.reason}_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Run the CLI: read inputs → create issues → write timestamped output.
 */
export async function runCli(args: CliArgs): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const client = new GitHubClient({ token });
  const verbose = args.verbose ?? false;

  const outputDir = args.out ?? DEFAULT_OUTPUT_DIR;

  // Ensure output directory exists and clean up previous error log
  await mkdir(outputDir, { recursive: true });
  const errorLogPath = join(outputDir, 'remediation-issues-errors.log');
  try {
    await unlink(errorLogPath);
  } catch {
    // File doesn't exist — that's fine
  }

  const input: RemediationInput = {};

  if (args.securityInput) {
    if (verbose) {
      console.log(`Reading security report from: ${args.securityInput}`);
    }
    const raw = await readFile(args.securityInput, 'utf-8');
    input.securityReport = JSON.parse(raw);
  }

  if (args.healthInput) {
    if (verbose) {
      console.log(`Reading health report from: ${args.healthInput}`);
    }
    const raw = await readFile(args.healthInput, 'utf-8');
    input.healthReport = JSON.parse(raw);
  }

  const options: RemediationOptions = {
    dryRun: args.dryRun,
    securityScoreThreshold: args.securityScoreThreshold,
    healthGradeThreshold: args.healthGradeThreshold,
    extraLabels: args.extraLabels,
    verbose,
  };

  const result = await createRemediationIssues(client, input, options);

  // Generate timestamp for filenames (same pattern as security-audit and health-check)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  // Write JSON output
  const jsonPath = join(outputDir, `${timestamp}-remediation.json`);
  await writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✓ JSON report written to: ${resolve(jsonPath)}`);

  // Write Markdown output
  const mdPath = join(outputDir, `${timestamp}-remediation.md`);
  await writeFile(mdPath, generateRemediationSummary(result), 'utf-8');
  console.log(`✓ Markdown summary written to: ${resolve(mdPath)}`);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('REMEDIATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Planned:  ${result.summary.totalPlanned}`);
  console.log(`Total Created:  ${result.summary.totalCreated}`);
  console.log(`Total Skipped:  ${result.summary.totalSkipped}`);
  console.log(`Mode:           ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('='.repeat(60) + '\n');

  // Write error log if any errors were collected
  if (result.errors && result.errors.length > 0) {
    await writeFile(errorLogPath, formatErrorLog('create-remediation-issues', result.errors), 'utf-8');
    console.log(`⚠️ ${result.errors.length} error(s) logged — see ${errorLogPath}`);
  }
}

// Run the CLI when executed directly (not imported by tests)
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  runCli(args).catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
