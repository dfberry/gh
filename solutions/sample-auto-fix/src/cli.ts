#!/usr/bin/env node

/**
 * CLI entry point for sample-auto-fix.
 *
 * Usage: sample-auto-fix [options]
 *
 * Options:
 *   --remediation-input <path>  Path to remediation-issues JSON
 *   --security-input <path>     Path to security-audit JSON
 *   --health-input <path>       Path to health-check JSON
 *   --azure-input <path>        Path to azure-best-practices JSON
 *   --out <dir>                 Output directory (default: generated/sample-auto-fix)
 *   --category <list>           Comma-separated categories to apply
 *   --apply                     Enable writes (default: dry-run)
 *   --dry-run                   Explicit dry-run mode
 *   --verbose                   Verbose logging
 *   --help                      Show help
 *
 * Environment Variables:
 *   GITHUB_TOKEN - Required (primary)
 *   GH_TOKEN     - Fallback if GITHUB_TOKEN not set
 */

import { autoFixFindings } from './index.js';
import type {
  RemediationIssuesReport,
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
  FixCategory,
} from './types.js';
import { GitHubClient } from 'github-rest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_OUTPUT_DIR = 'generated/sample-auto-fix';

export interface CliArgs {
  remediationInput?: string;
  securityInput?: string;
  healthInput?: string;
  azureInput?: string;
  out?: string;
  category?: string;
  apply?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

/** Parse process.argv-style arguments */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--remediation-input':
        args.remediationInput = argv[++i];
        break;
      case '--security-input':
        args.securityInput = argv[++i];
        break;
      case '--health-input':
        args.healthInput = argv[++i];
        break;
      case '--azure-input':
        args.azureInput = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--category':
        args.category = argv[++i];
        break;
      case '--apply':
        args.apply = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (flag.startsWith('--remediation-input=')) {
          args.remediationInput = flag.slice('--remediation-input='.length);
        } else if (flag.startsWith('--security-input=')) {
          args.securityInput = flag.slice('--security-input='.length);
        } else if (flag.startsWith('--health-input=')) {
          args.healthInput = flag.slice('--health-input='.length);
        } else if (flag.startsWith('--azure-input=')) {
          args.azureInput = flag.slice('--azure-input='.length);
        } else if (flag.startsWith('--out=')) {
          args.out = flag.slice('--out='.length);
        } else if (flag.startsWith('--category=')) {
          args.category = flag.slice('--category='.length);
        } else {
          console.error(`Error: Unknown argument "${flag}"`);
          printUsage();
          process.exit(1);
        }
        break;
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`
sample-auto-fix — Automated remediation with PR creation

Usage: sample-auto-fix [options]

Options:
  --remediation-input <path>  Path to remediation-issues JSON output
  --security-input <path>     Path to security-audit JSON output
  --health-input <path>       Path to health-check JSON output
  --azure-input <path>        Path to azure-best-practices JSON output
  --out <dir>                 Output directory (default: generated/sample-auto-fix)
  --category <list>           Comma-separated fix categories (e.g., missing-security-files,missing-azure-config)
  --apply                     Enable writes (creates branches and PRs). Default: dry-run only.
  --dry-run                   Explicit dry-run mode (no writes, output shows what would happen)
  --verbose                   Verbose logging
  --help, -h                  Show this help

Environment Variables:
  GITHUB_TOKEN    GitHub personal access token (required)
  GH_TOKEN        Fallback if GITHUB_TOKEN not set

Examples:
  # Dry-run (default)
  sample-auto-fix --security-input security-audit.json --out generated/auto-fix

  # Apply fixes for specific categories
  sample-auto-fix --security-input security-audit.json --category missing-security-files --apply

  # Multiple input sources
  sample-auto-fix \\
    --security-input generated/security-audit.json \\
    --health-input generated/health-check.json \\
    --azure-input generated/azure-bp.json \\
    --apply --verbose

Available Categories:
  - missing-security-files (SECURITY.md, .env.example, dependabot.yml)
  - missing-azure-config (azure.yaml)
`);
}

/** Load JSON file */
async function loadJSON<T>(path: string): Promise<T | undefined> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error loading ${path}:`, error);
    return undefined;
  }
}

/** Main CLI entry point */
export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  // Validate: at least one input source
  if (!args.remediationInput && !args.securityInput && !args.healthInput && !args.azureInput) {
    console.error('Error: At least one input source is required');
    printUsage();
    process.exit(1);
  }

  // Get GitHub token
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable required');
    process.exit(1);
  }

  const client = new GitHubClient({ token });
  const outDir = resolve(args.out || DEFAULT_OUTPUT_DIR);

  // Load input reports
  const reports: {
    remediation?: RemediationIssuesReport;
    security?: SecurityAuditReport;
    health?: HealthCheckReport;
    azure?: AzureBestPracticesReport;
  } = {};

  if (args.remediationInput) {
    reports.remediation = await loadJSON<RemediationIssuesReport>(args.remediationInput);
  }
  if (args.securityInput) {
    reports.security = await loadJSON<SecurityAuditReport>(args.securityInput);
  }
  if (args.healthInput) {
    reports.health = await loadJSON<HealthCheckReport>(args.healthInput);
  }
  if (args.azureInput) {
    reports.azure = await loadJSON<AzureBestPracticesReport>(args.azureInput);
  }

  // Parse categories
  const categories: FixCategory[] = args.category
    ? (args.category.split(',').map(c => c.trim()) as FixCategory[])
    : [];

  // Run auto-fix
  const result = await autoFixFindings(client, reports, {
    verbose: args.verbose,
    dryRun: args.dryRun,
    apply: args.apply,
    categories,
  });

  // Write output
  await mkdir(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(outDir, `auto-fix-${timestamp}.json`);
  await writeFile(outFile, JSON.stringify(result, null, 2));

  console.log(`\n✅ Results written to: ${outFile}`);

  if (result.dryRun) {
    console.log('\n⚠️  DRY-RUN mode: No changes were made. Use --apply to create PRs.');
  }

  // Exit with error code if there were errors
  if (result.errors.length > 0) {
    console.error(`\n❌ ${result.errors.length} error(s) occurred during execution`);
    process.exit(1);
  }
}

// Run if executed directly (Windows-safe: normalize backslashes)
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
