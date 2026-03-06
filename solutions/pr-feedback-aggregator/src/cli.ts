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
  const verbose = args.verbose ?? false;

  if (verbose) {
    console.log(`Reading repositories from: ${input}`);
  }

  const raw = await readFile(input, 'utf-8');
  const repos: string[] = JSON.parse(raw);

  const client = new GitHubClient({ token });

  const options: PRFeedbackOptions = {
    repos,
    outputDir: out,
    dryRun: args.dryRun ?? false,
    verbose,
    maxPRsPerRepo: args.maxPRsPerRepo ?? DEFAULT_MAX_PRS_PER_REPO,
    since: args.since,
    token,
  };

  const report = await generateReport(client, options);
  const markdown = generateMarkdownSummary(report);

  await mkdir(out, { recursive: true });
  const jsonPath = join(out, 'feedback-aggregation-report.json');
  const mdPath = join(out, 'feedback-aggregation-recommendations.md');

  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(mdPath, markdown);

  if (verbose) {
    console.log(`\n✓ JSON report written to: ${jsonPath}`);
    console.log(`✓ Markdown summary written to: ${mdPath}`);

    console.log('\n' + '='.repeat(60));
    console.log('PR FEEDBACK AGGREGATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Repositories Analyzed:  ${report.repoCount}`);
    console.log(`Total PRs:              ${report.totalPRs}`);
    console.log(`Total Comments:         ${report.totalComments}`);
    console.log(`Patterns Identified:    ${report.topPatterns.length}`);
    console.log('='.repeat(60) + '\n');
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
