/**
 * CLI entry point for create-remediation-issues.
 *
 * Reads report JSON files, invokes the core remediation pipeline, writes output.
 */

import { GitHubClient } from 'github-rest';
import { createRemediationIssues } from './index.js';
import type { RemediationInput, RemediationOptions } from './types.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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

  const input: RemediationInput = {};

  if (args.securityInput) {
    const raw = await readFile(args.securityInput, 'utf-8');
    input.securityReport = JSON.parse(raw);
  }

  if (args.healthInput) {
    const raw = await readFile(args.healthInput, 'utf-8');
    input.healthReport = JSON.parse(raw);
  }

  const options: RemediationOptions = {
    dryRun: args.dryRun,
    securityScoreThreshold: args.securityScoreThreshold,
    healthGradeThreshold: args.healthGradeThreshold,
    extraLabels: args.extraLabels,
  };

  const result = await createRemediationIssues(client, input, options);

  if (args.verbose) {
    console.log(JSON.stringify(result.summary, null, 2));
  }

  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify(result, null, 2), 'utf-8');
  }
}
