/**
 * Pure check functions — one per health signal.
 * NO API calls. Each takes pre-fetched data and returns a CheckResult.
 */

import type { CheckResult } from './scoring.js';

// ─── 1. Documentation Quality (25 pts) ──────────────────────────────────────

export function checkReadmeExists(readme: string | null): CheckResult {
  const passed = readme !== null && readme.length > 0;
  return {
    dimension: 'documentation',
    signal: 'readme_exists',
    passed,
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed ? 'README.md found' : 'No README.md found',
  };
}

export function checkReadmeQuality(readme: string | null): CheckResult {
  const length = readme?.length ?? 0;
  const passed = length >= 500;
  return {
    dimension: 'documentation',
    signal: 'readme_quality',
    passed,
    weight: 5,
    earned: passed ? 5 : 0,
    detail: `README is ${length} chars${passed ? '' : ' (minimum 500)'}`,
  };
}

export function checkReadmeSections(readme: string | null): CheckResult {
  if (!readme) {
    return {
      dimension: 'documentation',
      signal: 'readme_sections',
      passed: false,
      weight: 5,
      earned: 0,
      detail: 'No README to check for sections',
    };
  }
  const headingPattern = /^#{1,3}\s+.+/gm;
  const headings = readme.match(headingPattern) || [];
  const passed = headings.length >= 3;
  return {
    dimension: 'documentation',
    signal: 'readme_sections',
    passed,
    weight: 5,
    earned: passed ? 5 : 0,
    detail: `${headings.length} heading(s) found${passed ? '' : ' (minimum 3)'}`,
  };
}

export function checkLicenseExists(exists: boolean): CheckResult {
  return {
    dimension: 'documentation',
    signal: 'license_exists',
    passed: exists,
    weight: 5,
    earned: exists ? 5 : 0,
    detail: exists ? 'LICENSE found' : 'No LICENSE file found',
  };
}

export function checkContributingExists(exists: boolean): CheckResult {
  return {
    dimension: 'documentation',
    signal: 'contributing_exists',
    passed: exists,
    weight: 3,
    earned: exists ? 3 : 0,
    detail: exists ? 'CONTRIBUTING.md found' : 'No CONTRIBUTING.md found',
  };
}

export function checkCodeOfConductExists(exists: boolean): CheckResult {
  return {
    dimension: 'documentation',
    signal: 'code_of_conduct_exists',
    passed: exists,
    weight: 2,
    earned: exists ? 2 : 0,
    detail: exists ? 'CODE_OF_CONDUCT.md found' : 'No CODE_OF_CONDUCT.md found',
  };
}

// ─── 2. Repository Hygiene (12 pts) ─────────────────────────────────────────

export function checkGitignoreExists(exists: boolean): CheckResult {
  return {
    dimension: 'hygiene',
    signal: 'gitignore_exists',
    passed: exists,
    weight: 3,
    earned: exists ? 3 : 0,
    detail: exists ? '.gitignore found' : 'No .gitignore found',
  };
}

export function checkDescriptionSet(description: string | null | undefined): CheckResult {
  const passed = !!description && description.trim().length > 0;
  return {
    dimension: 'hygiene',
    signal: 'description_set',
    passed,
    weight: 3,
    earned: passed ? 3 : 0,
    detail: passed
      ? `Description: "${description!.slice(0, 80)}${description!.length > 80 ? '...' : ''}"`
      : 'No description set',
  };
}

export function checkTopicsSet(topics: string[] | null | undefined): CheckResult {
  const list = topics ?? [];
  const passed = list.length > 0;
  return {
    dimension: 'hygiene',
    signal: 'topics_set',
    passed,
    weight: 3,
    earned: passed ? 3 : 0,
    detail: passed
      ? `${list.length} topic(s): ${list.slice(0, 5).join(', ')}`
      : 'No topics set',
  };
}

export function checkNotArchived(archived: boolean): CheckResult {
  const passed = !archived;
  return {
    dimension: 'hygiene',
    signal: 'not_archived',
    passed,
    weight: 2,
    earned: passed ? 2 : 0,
    detail: passed ? 'Repository is active' : 'Repository is archived',
  };
}

export function checkDefaultBranchIsMain(defaultBranch: string): CheckResult {
  const passed = defaultBranch === 'main';
  return {
    dimension: 'hygiene',
    signal: 'default_branch_main',
    passed,
    weight: 1,
    earned: passed ? 1 : 0,
    detail: `Default branch: ${defaultBranch}`,
  };
}

// ─── 3. CI/CD Presence (20 pts) ─────────────────────────────────────────────

export function checkHasWorkflows(workflowCount: number): CheckResult {
  const passed = workflowCount >= 1;
  return {
    dimension: 'ci_cd',
    signal: 'has_workflows',
    passed,
    weight: 8,
    earned: passed ? 8 : 0,
    detail: passed
      ? `${workflowCount} workflow(s) found`
      : 'No GitHub Actions workflows found',
  };
}

export function checkRecentWorkflowSuccess(
  bestConclusion: string | null,
): CheckResult {
  const passed = bestConclusion === 'success';
  return {
    dimension: 'ci_cd',
    signal: 'recent_workflow_success',
    passed,
    weight: 7,
    earned: passed ? 7 : 0,
    detail: passed
      ? 'Most recent workflow run succeeded'
      : bestConclusion
        ? `Most recent workflow conclusion: ${bestConclusion}`
        : 'No workflow runs found',
  };
}

export function checkNoFailingWorkflows(failingCount: number): CheckResult {
  const passed = failingCount === 0;
  return {
    dimension: 'ci_cd',
    signal: 'no_failing_workflows',
    passed,
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed
      ? 'No failing workflows'
      : `${failingCount} workflow(s) with latest run failed`,
  };
}

// ─── 4. Dependency Freshness (16 pts) ───────────────────────────────────────

export function checkLowCriticalDependabot(criticalCount: number): CheckResult {
  const passed = criticalCount === 0;
  return {
    dimension: 'dependency_freshness',
    signal: 'low_critical_dependabot',
    passed,
    weight: 8,
    earned: passed ? 8 : 0,
    detail: passed
      ? 'No critical Dependabot alerts'
      : `${criticalCount} critical Dependabot alert(s)`,
  };
}

export function checkLowHighDependabot(highCount: number): CheckResult {
  const passed = highCount <= 2;
  return {
    dimension: 'dependency_freshness',
    signal: 'low_high_dependabot',
    passed,
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed
      ? `${highCount} high Dependabot alert(s) (≤2 allowed)`
      : `${highCount} high Dependabot alert(s) (max 2)`,
  };
}

export function checkAutomatedSecurityFixes(enabled: boolean): CheckResult {
  return {
    dimension: 'dependency_freshness',
    signal: 'automated_security_fixes',
    passed: enabled,
    weight: 3,
    earned: enabled ? 3 : 0,
    detail: enabled
      ? 'Automated security fixes enabled'
      : 'Automated security fixes not enabled',
  };
}

// ─── 5. Activity & Maintenance (16 pts) ─────────────────────────────────────

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export function checkRecentCommit(
  lastCommitDate: string | null,
): CheckResult {
  if (!lastCommitDate) {
    return {
      dimension: 'activity',
      signal: 'recent_commit',
      passed: false,
      weight: 8,
      earned: 0,
      detail: 'No commit date available',
    };
  }
  const ageMs = Date.now() - new Date(lastCommitDate).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const passed = ageMs <= SIX_MONTHS_MS;
  return {
    dimension: 'activity',
    signal: 'recent_commit',
    passed,
    weight: 8,
    earned: passed ? 8 : 0,
    detail: `Last commit ${ageDays} days ago${passed ? '' : ' (max 180)'}`,
  };
}

export function checkRecentPush(
  pushedAt: string | null,
): CheckResult {
  if (!pushedAt) {
    return {
      dimension: 'activity',
      signal: 'recent_push',
      passed: false,
      weight: 3,
      earned: 0,
      detail: 'No push date available',
    };
  }
  const ageMs = Date.now() - new Date(pushedAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const passed = ageMs <= SIX_MONTHS_MS;
  return {
    dimension: 'activity',
    signal: 'recent_push',
    passed,
    weight: 3,
    earned: passed ? 3 : 0,
    detail: `Last push ${ageDays} days ago${passed ? '' : ' (max 180)'}`,
  };
}

export function checkManageableIssues(openIssuesCount: number): CheckResult {
  const passed = openIssuesCount <= 20;
  return {
    dimension: 'activity',
    signal: 'manageable_issues',
    passed,
    weight: 3,
    earned: passed ? 3 : 0,
    detail: `${openIssuesCount} open issues${passed ? '' : ' (max 20)'}`,
  };
}

export function checkHasReleases(releaseCount: number): CheckResult {
  const passed = releaseCount >= 1;
  return {
    dimension: 'activity',
    signal: 'has_releases',
    passed,
    weight: 2,
    earned: passed ? 2 : 0,
    detail: passed ? `${releaseCount} release(s)` : 'No releases',
  };
}

// ─── 6. Branch Protection (5 pts) ───────────────────────────────────────────

export function checkBranchProtected(isProtected: boolean): CheckResult {
  return {
    dimension: 'branch_protection',
    signal: 'branch_protected',
    passed: isProtected,
    weight: 5,
    earned: isProtected ? 5 : 0,
    detail: isProtected
      ? 'Default branch is protected'
      : 'Default branch has no protection rules',
  };
}

// ─── 7. Azure Sample-Specific (7 pts) ───────────────────────────────────────

export function checkHasAzureTopic(topics: string[]): CheckResult {
  const azureTopics = (topics ?? []).filter(
    (t) => t.toLowerCase() === 'azure' || t.toLowerCase() === 'azure-samples',
  );
  const passed = azureTopics.length > 0;
  return {
    dimension: 'azure',
    signal: 'has_azure_topic',
    passed,
    weight: 3,
    earned: passed ? 3 : 0,
    detail: passed
      ? `Azure topics: ${azureTopics.join(', ')}`
      : 'No azure/azure-samples topic',
  };
}

const KNOWN_LANGUAGES = new Set([
  'javascript', 'typescript', 'python', 'java', 'csharp', 'c#', 'dotnet',
  'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'cpp', 'c++',
  'react', 'angular', 'vue', 'node', 'nodejs', 'deno', 'bun',
]);

export function checkHasLanguageTopics(topics: string[]): CheckResult {
  const langTopics = (topics ?? []).filter((t) =>
    KNOWN_LANGUAGES.has(t.toLowerCase()),
  );
  const passed = langTopics.length > 0;
  return {
    dimension: 'azure',
    signal: 'has_language_topics',
    passed,
    weight: 2,
    earned: passed ? 2 : 0,
    detail: passed
      ? `Language topics: ${langTopics.join(', ')}`
      : 'No recognized language topics',
  };
}

export function checkDescriptionMentionsAzure(
  description: string | null | undefined,
): CheckResult {
  if (!description || description.trim().length === 0) {
    return {
      dimension: 'azure',
      signal: 'description_mentions_azure',
      passed: false,
      weight: 2,
      earned: 0,
      detail: 'No description to check',
    };
  }
  const lower = description.toLowerCase();
  const passed = lower.includes('azure') || lower.includes('microsoft');
  return {
    dimension: 'azure',
    signal: 'description_mentions_azure',
    passed,
    weight: 2,
    earned: passed ? 2 : 0,
    detail: passed
      ? 'Description mentions Azure/Microsoft'
      : 'Description does not mention Azure',
  };
}
