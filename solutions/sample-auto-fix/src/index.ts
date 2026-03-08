/**
 * sample-auto-fix — Automated remediation with PR creation.
 *
 * Orchestrates the complete auto-fix pipeline:
 *   1. Parse upstream reports (security, health, azure)
 *   2. Extract fixable findings AND classify all findings
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
  FixPlan,
  ClassifiedFinding,
} from './types.js';

import { extractFixableFindings, extractAllFindings, filterByCategory, groupByRepo } from './parser.js';
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
  ClassifiedFinding,
  FindingFixability,
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

  // Step 1a: Extract ALL findings (classified)
  const allFindings = extractAllFindings(
    reports.remediation,
    reports.security,
    reports.health,
    reports.azure,
  );

  const autoFixable = allFindings.filter(f => f.fixability === 'auto-fixable');
  const manualAction = allFindings.filter(f => f.fixability === 'manual-action');
  const informational = allFindings.filter(f => f.fixability === 'informational');

  if (verbose) {
    console.log(`\n📊 All findings: ${allFindings.length} total`);
    console.log(`   ✅ Auto-fixable: ${autoFixable.length}`);
    console.log(`   ⚠️  Manual action: ${manualAction.length}`);
    console.log(`   ℹ️  Informational: ${informational.length}`);
  }

  // Step 1b: Extract fixable findings (for template-based PR creation)
  let findings = extractFixableFindings(
    reports.remediation,
    reports.security,
    reports.health,
    reports.azure,
  );

  if (verbose) {
    console.log(`\n📊 Extracted ${findings.length} fixable findings (will create PRs)`);
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
      if (allFindings.length > 0) {
        console.log(`\n⚠️  No auto-fixable findings — but ${allFindings.length} findings need attention`);
      } else {
        console.log('\n✨ No findings found across any input reports');
      }
    }
    return {
      dryRun: effectiveDryRun,
      created: [],
      skipped: [],
      errors: [],
      allFindings,
      summary: {
        totalPlanned: 0,
        totalCreated: 0,
        totalSkipped: 0,
        totalErrors: 0,
        totalAutoFixable: autoFixable.length,
        totalManualAction: manualAction.length,
        totalInformational: informational.length,
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
    plans: effectiveDryRun ? plans : undefined,
    allFindings,
    summary: {
      totalPlanned: plans.length,
      totalCreated: execution.created.length,
      totalSkipped: execution.skipped.length,
      totalErrors: execution.errors.length,
      totalAutoFixable: autoFixable.length,
      totalManualAction: manualAction.length,
      totalInformational: informational.length,
    },
  };

  if (verbose) {
    console.log('📊 Summary:');
    console.log(`  Planned: ${result.summary.totalPlanned}`);
    console.log(`  Created: ${result.summary.totalCreated}`);
    console.log(`  Skipped: ${result.summary.totalSkipped}`);
    console.log(`  Errors: ${result.summary.totalErrors}`);
    console.log(`  Manual action needed: ${result.summary.totalManualAction}`);
  }

  return result;
}

/** Maximum lines of template content to show in dry-run previews. */
const TEMPLATE_PREVIEW_LINES = 5;

/**
 * Generate markdown report from AutoFixResult.
 *
 * Includes ALL findings categorized by fixability:
 *   ✅ Auto-fixable (will create PRs)
 *   ⚠️ Requires manual action
 *   ℹ️ Informational
 */
export function generateMarkdownReport(result: AutoFixResult): string {
  let output = '# Auto-Fix Report\n\n';
  output += `**Generated:** ${new Date().toLocaleString()}\n\n`;

  if (result.dryRun) {
    output += '> 🔒 **DRY RUN** — No branches, files, or PRs were created.\n\n';
  }

  output += '============================================================\n\n';
  
  output += '## Mode\n\n';
  output += result.dryRun ? '⚠️ **DRY RUN** (no changes made)\n\n' : '✅ **APPLY** (changes committed)\n\n';
  
  output += '## Summary\n\n';
  output += `- **Planned:** ${result.summary.totalPlanned}\n`;
  output += `- **Created:** ${result.summary.totalCreated} ✅\n`;
  output += `- **Skipped:** ${result.summary.totalSkipped} ⏭️\n`;
  output += `- **Errors:** ${result.summary.totalErrors} ❌\n`;
  output += `- **Auto-fixable findings:** ${result.summary.totalAutoFixable}\n`;
  output += `- **Manual action required:** ${result.summary.totalManualAction}\n`;
  output += `- **Informational:** ${result.summary.totalInformational}\n\n`;

  // ── All Findings Section ──────────────────────────────────────────────
  const allFindings = result.allFindings ?? [];

  if (allFindings.length > 0) {
    const autoFixableF = allFindings.filter(f => f.fixability === 'auto-fixable');
    const manualActionF = allFindings.filter(f => f.fixability === 'manual-action');
    const informationalF = allFindings.filter(f => f.fixability === 'informational');

    output += '## All Findings\n\n';
    output += `Found **${allFindings.length}** total findings across all input reports.\n\n`;

    // Auto-fixable
    if (autoFixableF.length > 0) {
      output += '### ✅ Auto-Fixable\n\n';
      output += 'These findings can be automatically fixed by creating PRs with template files.\n\n';
      output += '| Repository | Signal | Description | Severity |\n';
      output += '|------------|--------|-------------|----------|\n';
      for (const f of autoFixableF) {
        output += `| ${f.owner}/${f.repo} | \`${f.signal}\` | ${f.description} | ${f.severity} |\n`;
      }
      output += '\n';
    }

    // Manual action
    if (manualActionF.length > 0) {
      output += '### ⚠️ Requires Manual Action\n\n';
      output += 'These findings cannot be auto-fixed and require human intervention.\n\n';
      for (const f of manualActionF) {
        output += `#### ${f.owner}/${f.repo} — \`${f.signal}\`\n\n`;
        output += `- **Severity:** ${f.severity}\n`;
        output += `- **Source:** ${f.source}\n`;
        output += `- **Issue:** ${f.description}\n`;
        if (f.manualAction) {
          output += `- **Action:** ${f.manualAction}\n`;
        }
        output += '\n';
      }
    }

    // Informational
    if (informationalF.length > 0) {
      output += '### ℹ️ Informational\n\n';
      output += 'These findings are tracked for awareness but require no immediate action.\n\n';
      output += '| Repository | Signal | Description | Source |\n';
      output += '|------------|--------|-------------|--------|\n';
      for (const f of informationalF) {
        output += `| ${f.owner}/${f.repo} | \`${f.signal}\` | ${f.description} | ${f.source} |\n`;
      }
      output += '\n';
    }
  } else {
    output += '## All Findings\n\n';
    output += '✨ No findings detected across any input reports. All checks passing!\n\n';
  }

  // Dry-run: show detailed fix plans
  if (result.dryRun && result.plans && result.plans.length > 0) {
    output += '## What Would Happen\n\n';
    output += `The following **${result.plans.length}** fix(es) would be applied:\n\n`;

    for (const plan of result.plans) {
      output += `### ${plan.owner}/${plan.repo}\n\n`;
      output += `| Field | Value |\n`;
      output += `|-------|-------|\n`;
      output += `| **Category** | \`${plan.category}\` |\n`;
      output += `| **Branch** | \`${plan.branch}\` |\n`;
      output += `| **PR Title** | ${plan.prTitle} |\n`;
      output += `| **Files** | ${plan.templates.map(t => `\`${t.path}\``).join(', ')} |\n\n`;

      // Template previews
      for (const template of plan.templates) {
        const previewLines = template.content.split('\n').slice(0, TEMPLATE_PREVIEW_LINES);
        const truncated = template.content.split('\n').length > TEMPLATE_PREVIEW_LINES;

        output += `<details>\n`;
        output += `<summary>📄 ${template.path} preview</summary>\n\n`;
        output += '```\n';
        output += previewLines.join('\n');
        if (truncated) {
          output += '\n# ... (truncated)';
        }
        output += '\n```\n\n';
        output += `</details>\n\n`;
      }
    }
  }

  // Created fixes (live mode)
  if (result.created.length > 0 && !result.dryRun) {
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
  
  // Dry-run: how to apply
  if (result.dryRun) {
    output += '## How to Apply\n\n';
    output += 'To apply these fixes, run with `--apply`:\n\n';
    output += '```bash\n';
    output += 'npm run sample-auto-fix -- --security-input <path> --apply\n';
    output += '```\n\n';
  }

  output += '============================================================\n';
  
  return output;
}
