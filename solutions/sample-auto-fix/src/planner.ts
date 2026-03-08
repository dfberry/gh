/**
 * Planner — builds fix plans from fixable findings.
 */

import type { FixableFinding, FixPlan, FixTemplate } from './types.js';
import { SECURITY_MD_TEMPLATE } from './templates/security-md.js';
import { ENV_EXAMPLE_TEMPLATE } from './templates/env-example.js';
import { DEPENDABOT_YML_TEMPLATE } from './templates/dependabot-yml.js';
import { AZURE_YAML_TEMPLATE } from './templates/azure-yaml.js';

/**
 * Build fix plans from findings grouped by repository.
 */
export function buildFixPlans(
  findingsByRepo: Map<string, FixableFinding[]>,
): FixPlan[] {
  const plans: FixPlan[] = [];
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

  for (const [repoKey, findings] of findingsByRepo.entries()) {
    // Group findings by category within this repo
    const categoriesMap = new Map<string, FixableFinding[]>();
    
    for (const finding of findings) {
      const existing = categoriesMap.get(finding.category) || [];
      existing.push(finding);
      categoriesMap.set(finding.category, existing);
    }

    // Create one plan per category
    for (const [category, categoryFindings] of categoriesMap.entries()) {
      const finding = categoryFindings[0]; // All have same owner/repo
      const allMissingFiles = new Set<string>();
      
      // Collect all missing files for this category
      for (const f of categoryFindings) {
        f.missingFiles.forEach(file => allMissingFiles.add(file));
      }

      const templates = buildTemplates(Array.from(allMissingFiles));
      const branch = `autofix/${category}-${timestamp}`;
      const prTitle = buildPRTitle(category, allMissingFiles);
      const prBody = buildPRBody(category, allMissingFiles);

      plans.push({
        owner: finding.owner,
        repo: finding.repo,
        category: finding.category,
        branch,
        prTitle,
        prBody,
        templates,
      });
    }
  }

  return plans;
}

/**
 * Build templates for missing files.
 */
function buildTemplates(missingFiles: string[]): FixTemplate[] {
  const templates: FixTemplate[] = [];

  for (const file of missingFiles) {
    const template = getTemplateForFile(file);
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

/**
 * Get template for a specific file.
 */
function getTemplateForFile(filePath: string): FixTemplate | null {
  switch (filePath) {
    case 'SECURITY.md':
      return {
        path: 'SECURITY.md',
        content: SECURITY_MD_TEMPLATE,
        commitMessage: 'chore: add SECURITY.md with vulnerability reporting instructions',
      };
    
    case '.env.example':
      return {
        path: '.env.example',
        content: ENV_EXAMPLE_TEMPLATE,
        commitMessage: 'chore: add .env.example template for environment variables',
      };
    
    case '.github/dependabot.yml':
      return {
        path: '.github/dependabot.yml',
        content: DEPENDABOT_YML_TEMPLATE,
        commitMessage: 'chore: add Dependabot configuration for automated dependency updates',
      };
    
    case 'azure.yaml':
      return {
        path: 'azure.yaml',
        content: AZURE_YAML_TEMPLATE,
        commitMessage: 'chore: add Azure Developer CLI configuration',
      };
    
    default:
      return null;
  }
}

/**
 * Build PR title for a fix category.
 */
function buildPRTitle(category: string, missingFiles: Set<string>): string {
  const fileCount = missingFiles.size;
  const fileWord = fileCount === 1 ? 'file' : 'files';
  
  switch (category) {
    case 'missing-security-files':
      return `[auto-fix] Add missing security ${fileWord}`;
    case 'missing-azure-config':
      return `[auto-fix] Add Azure configuration`;
    default:
      return `[auto-fix] Add missing ${fileWord}`;
  }
}

/**
 * Build PR body with fix summary.
 */
function buildPRBody(category: string, missingFiles: Set<string>): string {
  const lines: string[] = [
    '## Automated Fix',
    '',
    'This PR was automatically created to address missing configuration files.',
    '',
  ];

  switch (category) {
    case 'missing-security-files':
      lines.push('### Security Files Added');
      lines.push('');
      lines.push('The following security-related files have been added to improve repository health:');
      break;
    case 'missing-azure-config':
      lines.push('### Azure Configuration Added');
      lines.push('');
      lines.push('The following Azure configuration files have been added:');
      break;
    default:
      lines.push('### Files Added');
      break;
  }

  lines.push('');
  for (const file of Array.from(missingFiles).sort()) {
    lines.push(`- \`${file}\``);
  }

  lines.push('');
  lines.push('### What to do next');
  lines.push('');
  lines.push('1. Review the added files and customize them for your project');
  lines.push('2. Update any placeholder values or configuration as needed');
  lines.push('3. Test the changes in your environment');
  lines.push('4. Merge this PR when ready');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This PR was created by the sample-auto-fix automation tool.*');

  return lines.join('\n');
}
