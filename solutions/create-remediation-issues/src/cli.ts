/**
 * CLI entry point for create-remediation-issues.
 *
 * Reads report JSON files, invokes the core remediation pipeline, writes output.
 */

import { GitHubClient } from 'github-rest';
import { createRemediationIssues } from './index.js';
import type { RemediationInput, RemediationOptions, PipelineError } from './types.js';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface CliArgs {
  securityInput?: string;
  healthInput?: string;
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
 * Run the CLI: read inputs → create issues → write output.
 */
export async function runCli(args: CliArgs): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const client = new GitHubClient({ token });
  const verbose = args.verbose ?? false;

  // Clean up any previous error log from the output directory
  const errorDir = args.out ? dirname(args.out) : 'generated/remediation-issues';
  await mkdir(errorDir, { recursive: true });
  const errorLogPath = join(errorDir, 'remediation-issues-errors.log');
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

  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify(result, null, 2), 'utf-8');
    if (verbose) {
      console.log(`\n✓ Output written to: ${args.out}`);
    }
  }

  // Print summary
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('REMEDIATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Planned:  ${result.summary.totalPlanned}`);
    console.log(`Total Created:  ${result.summary.totalCreated}`);
    console.log(`Total Skipped:  ${result.summary.totalSkipped}`);
    console.log(`Mode:           ${result.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('='.repeat(60) + '\n');
  }

  // Write error log if any errors were collected
  if (result.errors && result.errors.length > 0) {
    const errorDir = args.out ? dirname(args.out) : 'generated/remediation-issues';
    await mkdir(errorDir, { recursive: true });
    const errorLogPath = join(errorDir, 'remediation-issues-errors.log');
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
