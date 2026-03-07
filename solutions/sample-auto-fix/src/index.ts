/**
 * sample-auto-fix — Automated remediation with PR creation.
 *
 * Orchestrates the complete auto-fix pipeline:
 *   1. Parse upstream reports (security, health, azure)
 *   2. Extract fixable findings
 *   3. Build fix plans with templates
 *   4. Execute plans (create branches, write files, open PRs)
 */

import type { GitHubClient } from 'github-rest';
import type {
  AutoFixInput,
  AutoFixOptions,
  AutoFixResult,
  RemediationIssuesReport,
  SecurityAuditReport,
  HealthCheckReport,
  AzureBestPracticesReport,
} from './types.js';

import { extractFixableFindings, filterByCategory, groupByRepo } from './parser.js';
import { buildFixPlans } from './planner.js';
import { executeFixPlans } from './executor.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type {
  AutoFixInput,
  AutoFixOptions,
  AutoFixResult,
  FixableFinding,
  FixPlan,
  CreatedFix,
  SkippedFix,
  FixError,
  FixCategory,
} from './types.js';

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Auto-fix findings from upstream reports.
 */
export async function autoFixFindings(
  client: GitHubClient,
  reports: {
    remediation?: RemediationIssuesReport;
    security?: SecurityAuditReport;
    health?: HealthCheckReport;
    azure?: AzureBestPracticesReport;
  },
  options: AutoFixOptions = {},
): Promise<AutoFixResult> {
  const { verbose = false, dryRun = false, apply = false, categories = [] } = options;

  // Determine mode: dry-run by default unless --apply is explicitly set
  const effectiveDryRun = dryRun || !apply;

  if (verbose) {
    console.log(`\n🔧 sample-auto-fix`);
    console.log(`Mode: ${effectiveDryRun ? 'DRY-RUN' : 'APPLY'}`);
    if (categories.length > 0) {
      console.log(`Categories: ${categories.join(', ')}`);
    }
  }

  // Step 1: Extract fixable findings
  let findings = extractFixableFindings(
    reports.remediation,
    reports.security,
    reports.health,
    reports.azure,
  );

  if (verbose) {
    console.log(`\n📊 Extracted ${findings.length} fixable findings`);
  }

  // Step 2: Filter by category (if specified)
  if (categories.length > 0) {
    findings = filterByCategory(findings, categories);
    if (verbose) {
      console.log(`📊 Filtered to ${findings.length} findings for selected categories`);
    }
  }

  if (findings.length === 0) {
    if (verbose) {
      console.log('\n✨ No fixable findings found');
    }
    return {
      dryRun: effectiveDryRun,
      created: [],
      skipped: [],
      errors: [],
      summary: {
        totalPlanned: 0,
        totalCreated: 0,
        totalSkipped: 0,
        totalErrors: 0,
      },
    };
  }

  // Step 3: Group by repository
  const findingsByRepo = groupByRepo(findings);
  if (verbose) {
    console.log(`📦 Grouped into ${findingsByRepo.size} repositories`);
  }

  // Step 4: Build fix plans
  const plans = buildFixPlans(findingsByRepo);
  if (verbose) {
    console.log(`📋 Built ${plans.length} fix plans`);
  }

  // Step 5: Execute fix plans
  if (verbose) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('Executing fix plans...');
  }

  const execution = await executeFixPlans(client, plans, effectiveDryRun, verbose);

  if (verbose) {
    console.log(`${'─'.repeat(60)}\n`);
  }

  // Step 6: Build result
  const result: AutoFixResult = {
    dryRun: effectiveDryRun,
    created: execution.created,
    skipped: execution.skipped,
    errors: execution.errors,
    summary: {
      totalPlanned: plans.length,
      totalCreated: execution.created.length,
      totalSkipped: execution.skipped.length,
      totalErrors: execution.errors.length,
    },
  };

  if (verbose) {
    console.log('📊 Summary:');
    console.log(`  Planned: ${result.summary.totalPlanned}`);
    console.log(`  Created: ${result.summary.totalCreated}`);
    console.log(`  Skipped: ${result.summary.totalSkipped}`);
    console.log(`  Errors: ${result.summary.totalErrors}`);
  }

  return result;
}

/**
 * Generate markdown report from AutoFixResult.
 */
export function generateMarkdownReport(result: AutoFixResult): string {
  let output = '# Auto-Fix Report\n\n';
  output += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  output += '============================================================\n\n';
  
  output += '## Mode\n\n';
  output += result.dryRun ? '⚠️ **DRY RUN** (no changes made)\n\n' : '✅ **APPLY** (changes committed)\n\n';
  
  output += '## Summary\n\n';
  output += `- **Planned:** ${result.summary.totalPlanned}\n`;
  output += `- **Created:** ${result.summary.totalCreated} ✅\n`;
  output += `- **Skipped:** ${result.summary.totalSkipped} ⏭️\n`;
  output += `- **Errors:** ${result.summary.totalErrors} ❌\n\n`;
  
  // Created fixes
  if (result.created.length > 0) {
    output += '## Created Fixes\n\n';
    for (const fix of result.created) {
      output += `### ${fix.repo}\n\n`;
      output += `- **Category:** ${fix.category}\n`;
      output += `- **Branch:** ${fix.branch}\n`;
      output += `- **PR:** [#${fix.prNumber}](${fix.prUrl})\n`;
      output += `- **Files Modified:** ${fix.filesModified.join(', ')}\n\n`;
    }
  }
  
  // Skipped fixes
  if (result.skipped.length > 0) {
    output += '## Skipped Fixes\n\n';
    for (const skip of result.skipped) {
      output += `### ${skip.repo}\n\n`;
      output += `- **Category:** ${skip.category}\n`;
      output += `- **Reason:** ${skip.reason}\n\n`;
    }
  }
  
  // Errors
  if (result.errors.length > 0) {
    output += '## Errors\n\n';
    for (const err of result.errors) {
      output += `### ${err.repo}\n\n`;
      output += `- **Category:** ${err.category}\n`;
      output += `- **Error:** ${err.message}\n`;
      if (err.suggestion) {
        output += `- **Suggestion:** ${err.suggestion}\n`;
      }
      output += '\n';
    }
  }
  
  output += '============================================================\n';
  
  return output;
}
