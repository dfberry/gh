#!/usr/bin/env node

/**
 * CLI entry point for sample-health-check.
 *
 * Usage: sample-health-check [--input <repos.json>] [--out <dir>] [--format json|markdown|both] [--verbose]
 *
 * Environment Variables:
 *   GITHUB_TOKEN - Required (primary)
 *   GH_TOKEN     - Fallback if GITHUB_TOKEN not set
 */

import { checkReposHealth, generateHealthSummary, type PipelineError } from './index.js';
import { GitHubClient } from 'github-rest';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);

  let inputPath = 'active-sample-repos.json';
  let outputDir = 'generated/sample-health-check';
  let format: 'json' | 'markdown' | 'both' = 'both';
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
    } else if (arg === '--input' && args[i + 1]) {
      inputPath = args[++i];
    } else if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length);
    } else if (arg === '--out' && args[i + 1]) {
      outputDir = args[++i];
    } else if (arg.startsWith('--format=')) {
      const f = arg.slice('--format='.length);
      if (f === 'json' || f === 'markdown' || f === 'both') {
        format = f;
      } else {
        console.error(`Error: Invalid format "${f}". Must be json, markdown, or both.`);
        process.exit(1);
      }
    } else if (arg === '--format' && args[i + 1]) {
      const f = args[++i];
      if (f === 'json' || f === 'markdown' || f === 'both') {
        format = f;
      } else {
        console.error(`Error: Invalid format "${f}". Must be json, markdown, or both.`);
        process.exit(1);
      }
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument "${arg}"`);
      printUsage();
      process.exit(1);
    }
  }

  // Token: GITHUB_TOKEN primary, GH_TOKEN fallback (Decision #9)
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  try {
    if (verbose) console.log(`Reading repositories from: ${inputPath}`);

    const inputContent = await fs.readFile(inputPath, 'utf8');
    const repos = JSON.parse(inputContent);

    if (!Array.isArray(repos)) {
      console.error('Error: Input file must contain a JSON array of repository names');
      process.exit(1);
    }

    if (repos.length === 0) {
      console.error('Error: Input file contains no repositories');
      process.exit(1);
    }

    console.log(`\n🏥 Health Check for ${repos.length} repositories`);
    console.log(`Output: ${outputDir}`);
    console.log(`Format: ${format}\n`);

    const client = new GitHubClient({ token });
    const report = await checkReposHealth(client, repos, { verbose });

    // Ensure output directory
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Write JSON
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(outputDir, `${timestamp}-health.json`);
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\n✓ JSON report written to: ${path.resolve(jsonPath)}`);
    }

    // Write Markdown
    if (format === 'markdown' || format === 'both') {
      const mdPath = path.join(outputDir, `${timestamp}-health.md`);
      const summary = generateHealthSummary(report);
      await fs.writeFile(mdPath, summary, 'utf8');
      console.log(`✓ Markdown summary written to: ${path.resolve(mdPath)}`);
    }

    // Console summary
    console.log('\n' + '='.repeat(60));
    console.log('HEALTH CHECK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Repositories:      ${report.summary.totalRepos}`);
    console.log(`Average Health Score:    ${report.summary.avgScore}/100 (${report.summary.avgGrade})`);
    console.log(`Grade Distribution:      ${Object.entries(report.summary.gradeDistribution).map(([g, n]) => `${g}:${n}`).join(' ')}`);
    console.log(`Weakest Area:            ${report.summary.worstDimension}`);
    console.log('='.repeat(60) + '\n');

    // Highlight repos needing attention
    const struggling = report.repos
      .filter((r) => r.score < 50)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    if (struggling.length > 0) {
      console.log('⚠️  ATTENTION NEEDED (lowest scores):');
      for (const r of struggling) {
        console.log(`   ${r.owner}/${r.repo}: ${r.score}/100 (${r.grade})`);
      }
      console.log('');
    }

    // Write error log if any repos failed
    if (report.errors && report.errors.length > 0) {
      const errorLogPath = path.join(outputDir, 'health-check-errors.log');
      await fs.writeFile(errorLogPath, formatErrorLog('sample-health-check', report.errors), 'utf8');
      console.log(`⚠️ ${report.errors.length} error(s) logged — see ${errorLogPath}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);

      if (error.message.includes('ENOENT')) {
        console.error('\nFile not found. Check that the input file path is correct.');
      } else if (error.message.includes('JSON')) {
        console.error('\nInvalid JSON format. Check that the input file is properly formatted.');
      } else if (error.message.includes('401')) {
        console.error('\nAuthentication failed. Check that your GITHUB_TOKEN is valid.');
      } else if (error.message.includes('403')) {
        console.error('\nAccess forbidden. Check that your GITHUB_TOKEN has required permissions.');
      }

      if (verbose && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('\nUnexpected error:', error);
    }

    process.exit(2);
  }
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

function printUsage() {
  console.log(`
Sample Health Check for GitHub Repositories

Usage: sample-health-check [options]

Options:
  --input <path>   Path to JSON file with repo names (default: active-sample-repos.json)
  --out <path>     Output directory (default: generated/sample-health-check)
  --format <type>  Output format: json, markdown, or both (default: both)
  --verbose        Enable verbose logging
  --help, -h       Show this help message

Environment Variables:
  GITHUB_TOKEN     Required: GitHub personal access token (primary)
  GH_TOKEN         Fallback if GITHUB_TOKEN is not set

Example:
  sample-health-check --input repos.json --out reports --format both --verbose

Health Dimensions (100 points total):
  Documentation Quality  (25 pts) — README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT
  CI/CD Presence         (20 pts) — Workflows, recent runs, pass status
  Dependency Freshness   (16 pts) — Dependabot alerts, auto-fix
  Activity & Maintenance (16 pts) — Recent commits, pushes, issues, releases
  Repository Hygiene     (12 pts) — .gitignore, description, topics, archive status
  Azure Sample-Specific  ( 7 pts) — Azure topics, language tags, description
  Branch Protection      ( 5 pts) — Default branch protection rules

Grades: A (90-100), B (75-89), C (50-74), D (25-49), F (0-24)

Output:
  Generates timestamped files:
  - {timestamp}-health.json    (structured health data)
  - {timestamp}-health.md      (human-readable summary)
`);
}

main();
