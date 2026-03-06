/**
 * CLI entry point for pr-feedback-aggregator.
 *
 * Parses CLI flags, reads input, runs the feedback pipeline,
 * and writes JSON + Markdown output files.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubClient } from 'github-rest';
import {
  generateReport,
  generateMarkdownSummary,
  DEFAULT_MAX_PRS_PER_REPO,
} from './index.js';
import type { PRFeedbackOptions } from './types.js';

export interface CliArgs {
  input: string;
  out: string;
  dryRun: boolean;
  verbose: boolean;
  maxPRsPerRepo: number;
  since?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: '',
    out: './output',
    dryRun: false,
    verbose: false,
    maxPRsPerRepo: DEFAULT_MAX_PRS_PER_REPO,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--max-prs': {
        const val = Number(argv[++i]);
        if (!Number.isInteger(val) || val <= 0) {
          throw new Error(`--max-prs must be a positive integer, got: ${argv[i]}`);
        }
        args.maxPRsPerRepo = val;
        break;
      }
      case '--since': {
        const dateStr = argv[++i];
        if (isNaN(new Date(dateStr).getTime())) {
          throw new Error(`--since must be a valid ISO date, got: ${dateStr}`);
        }
        args.since = dateStr;
        break;
      }
    }
  }

  return args;
}

export async function runCli(args: Partial<CliArgs>): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const input = args.input ?? '';
  const out = args.out ?? './output';

  const raw = await readFile(input, 'utf-8');
  const repos: string[] = JSON.parse(raw);

  const client = new GitHubClient({ token });

  const options: PRFeedbackOptions = {
    repos,
    outputDir: out,
    dryRun: args.dryRun ?? false,
    verbose: args.verbose ?? false,
    maxPRsPerRepo: args.maxPRsPerRepo ?? DEFAULT_MAX_PRS_PER_REPO,
    since: args.since,
    token,
  };

  const report = await generateReport(client, options);
  const markdown = generateMarkdownSummary(report);

  await mkdir(out, { recursive: true });
  await writeFile(
    join(out, 'feedback-aggregation-report.json'),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    join(out, 'feedback-aggregation-recommendations.md'),
    markdown,
  );
}
