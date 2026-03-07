#!/usr/bin/env node
import { auditRepos, generateAuditSummary, type PipelineError } from './index.js';
import { GitHubClient } from 'github-rest';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * CLI entry point for security-audit-repos
 * 
 * Usage: security-audit-repos [--input <repos.json>] [--out <output-dir>] [--format json|markdown|both]
 * 
 * Options:
 *   --input <path>   - Path to JSON file containing array of repo names (default: active-sample-repos.json)
 *   --out <path>     - Output directory for results (default: generated/security-audit)
 *   --format <type>  - Output format: json, markdown, or both (default: both)
 *   --verbose        - Enable verbose logging
 * 
 * Environment Variables:
 *   GITHUB_TOKEN - Required: GitHub personal access token (primary)
 *   GH_TOKEN     - Fallback if GITHUB_TOKEN is not set
 * 
 * Output:
 *   Generates timestamped files in output directory:
 *   - {timestamp}-audit.json (security data)
 *   - {timestamp}-audit.md (human-readable summary)
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  let inputPath = 'active-sample-repos.json';
  let outputDir = 'generated/security-audit';
  let format: 'json' | 'markdown' | 'both' = 'both';
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      const formatArg = args[i + 1];
      if (formatArg === 'json' || formatArg === 'markdown' || formatArg === 'both') {
        format = formatArg;
      } else {
        console.error(`Error: Invalid format "${formatArg}". Must be json, markdown, or both.`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--verbose') {
      verbose = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument "${args[i]}"`);
      printUsage();
      process.exit(1);
    }
  }

  // Check for GitHub token (GITHUB_TOKEN primary, GH_TOKEN fallback)
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  try {
    // Read input file
    if (verbose) {
      console.log(`Reading repositories from: ${inputPath}`);
    }
    
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

    console.log(`\n📊 Security Audit for ${repos.length} repositories`);
    console.log(`Output: ${outputDir}`);
    console.log(`Format: ${format}\n`);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Clean up any previous error log from this directory
    const errorLogPath = path.join(outputDir, 'security-audit-errors.log');
    try {
      await fs.unlink(errorLogPath);
    } catch {
      // File doesn't exist — that's fine
    }

    // Create GitHub client
    const client = new GitHubClient({ token });

    // Perform audit
    const report = await auditRepos(client, repos, { verbose });

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Write JSON output
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(outputDir, `${timestamp}-audit.json`);
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\n✓ JSON report written to: ${path.resolve(jsonPath)}`);
    }

    // Write Markdown output
    if (format === 'markdown' || format === 'both') {
      const markdownPath = path.join(outputDir, `${timestamp}-audit.md`);
      const summary = generateAuditSummary(report);
      await fs.writeFile(markdownPath, summary, 'utf8');
      console.log(`✓ Markdown summary written to: ${path.resolve(markdownPath)}`);
    }

    // Print summary to console
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Repositories:           ${report.summary.totalRepos}`);
    console.log(`Average Security Score:       ${report.summary.avgScore}/100`);
    console.log(`Total Dependabot Alerts:      ${report.summary.totalDependabotAlerts}`);
    console.log(`Total Code Scanning Alerts:   ${report.summary.totalCodeScanningAlerts}`);
    console.log(`Total Secret Scanning Alerts: ${report.summary.totalSecretScanningAlerts}`);
    console.log(`Repos Without Branch Protection: ${report.summary.reposWithoutBranchProtection}`);
    console.log('='.repeat(60) + '\n');

    // Show top issues
    const criticalRepos = report.repos
      .filter(r => r.score < 50)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    if (criticalRepos.length > 0) {
      console.log('⚠️  ATTENTION NEEDED (lowest scores):');
      for (const repo of criticalRepos) {
        console.log(`   ${repo.owner}/${repo.repo}: ${repo.score}/100`);
      }
      console.log('');
    }

    // Write error log if any repos failed
    if (report.errors && report.errors.length > 0) {
      const errorLogPath = path.join(outputDir, 'security-audit-errors.log');
      await fs.writeFile(errorLogPath, formatErrorLog('security-audit-repos', report.errors), 'utf8');
      console.log(`⚠️ ${report.errors.length} error(s) logged — see ${errorLogPath}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
      
      // Provide helpful context
      if (error.message.includes('ENOENT')) {
        console.error('\nFile not found. Check that the input file path is correct.');
      } else if (error.message.includes('JSON')) {
        console.error('\nInvalid JSON format. Check that the input file is properly formatted.');
      } else if (error.message.includes('401')) {
        console.error('\nAuthentication failed. Check that your GITHUB_TOKEN is valid.');
      } else if (error.message.includes('403')) {
        console.error('\nAccess forbidden. Check that your GITHUB_TOKEN has required permissions.');
      } else if (error.message.includes('404')) {
        console.error('\nRepository not found. Check that repository names are correct.');
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
Security Audit for GitHub Repositories

Usage: security-audit-repos [options]

Options:
  --input <path>   Path to JSON file with repo names (default: active-sample-repos.json)
  --out <path>     Output directory (default: generated/security-audit)
  --format <type>  Output format: json, markdown, or both (default: both)
  --verbose        Enable verbose logging
  --help, -h       Show this help message

Environment Variables:
  GITHUB_TOKEN     Required: GitHub personal access token (primary)
  GH_TOKEN         Fallback if GITHUB_TOKEN is not set

Example:
  security-audit-repos --input repos.json --out reports --format both --verbose

Output:
  Generates timestamped files:
  - {timestamp}-audit.json    (structured security data)
  - {timestamp}-audit.md      (human-readable summary)
`);
}

// Run the CLI
main();
