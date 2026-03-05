import { describe, it, expect } from 'vitest';

// Import check functions — these are pure functions per the architecture spec.
// Wash is building them in parallel; tests define the contract.
import {
  // Documentation Quality
  checkReadmeExists,
  checkReadmeQuality,
  checkReadmeSections,
  checkLicenseExists,
  checkContributingExists,
  checkCodeOfConductExists,
  // Repository Hygiene
  checkGitignoreExists,
  checkDescriptionSet,
  checkTopicsSet,
  checkNotArchived,
  checkDefaultBranchIsMain,
  // CI/CD Presence
  checkHasWorkflows,
  checkRecentWorkflowSuccess,
  checkNoFailingWorkflows,
  // Dependency Freshness
  checkLowCriticalDependabot,
  checkLowHighDependabot,
  checkAutomatedSecurityFixes,
  // Activity & Maintenance
  checkRecentCommit,
  checkRecentPush,
  checkManageableIssues,
  checkHasReleases,
  // Branch Protection
  checkBranchProtected,
  // Azure-Specific
  checkHasAzureTopic,
  checkHasLanguageTopics,
  checkDescriptionMentionsAzure,
} from './checks.js';

// ─── 1. Documentation Quality ────────────────────────────────────────────────

describe('Documentation Quality checks', () => {
  describe('checkReadmeExists', () => {
    it('should return passed=true with earned=5 when readme content is present', () => {
      const result = checkReadmeExists('# My Project\nSome content here');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('readme_exists');
    });

    it('should return passed=false with earned=0 when readme is null', () => {
      const result = checkReadmeExists(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('readme_exists');
    });

    it('should return passed=false with earned=0 when readme is empty string', () => {
      const result = checkReadmeExists('');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkReadmeQuality', () => {
    it('should return passed=true with earned=5 when readme is >= 500 chars', () => {
      const longReadme = 'A'.repeat(500);
      const result = checkReadmeQuality(longReadme);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('readme_quality');
    });

    it('should return passed=false with earned=0 when readme is < 500 chars', () => {
      const shortReadme = 'A'.repeat(499);
      const result = checkReadmeQuality(shortReadme);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when readme is null', () => {
      const result = checkReadmeQuality(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should include char count in detail', () => {
      const readme = 'A'.repeat(1247);
      const result = checkReadmeQuality(readme);
      expect(result.detail).toContain('1247');
    });
  });

  describe('checkReadmeSections', () => {
    it('should return passed=true when readme has markdown headings', () => {
      const readme = '# Title\n\n## Prerequisites\n\nSome content\n\n## Setup\n\nMore content';
      const result = checkReadmeSections(readme);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('readme_sections');
    });

    it('should return passed=false when readme has no headings', () => {
      const readme = 'Just some plain text without any headings or structure.';
      const result = checkReadmeSections(readme);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false when readme is null', () => {
      const result = checkReadmeSections(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkLicenseExists', () => {
    it('should return passed=true with earned=5 when license is present', () => {
      const result = checkLicenseExists(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('license_exists');
    });

    it('should return passed=false with earned=0 when license is missing', () => {
      const result = checkLicenseExists(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkContributingExists', () => {
    it('should return passed=true with earned=3 when contributing guide is present', () => {
      const result = checkContributingExists(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('contributing_exists');
    });

    it('should return passed=false with earned=0 when contributing is missing', () => {
      const result = checkContributingExists(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkCodeOfConductExists', () => {
    it('should return passed=true with earned=2 when code of conduct is present', () => {
      const result = checkCodeOfConductExists(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
      expect(result.weight).toBe(2);
      expect(result.dimension).toBe('documentation');
      expect(result.signal).toBe('code_of_conduct_exists');
    });

    it('should return passed=false with earned=0 when code of conduct is missing', () => {
      const result = checkCodeOfConductExists(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 2. Repository Hygiene ───────────────────────────────────────────────────

describe('Repository Hygiene checks', () => {
  describe('checkGitignoreExists', () => {
    it('should return passed=true with earned=3 when .gitignore is present', () => {
      const result = checkGitignoreExists(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('hygiene');
      expect(result.signal).toBe('gitignore_exists');
    });

    it('should return passed=false with earned=0 when .gitignore is missing', () => {
      const result = checkGitignoreExists(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkDescriptionSet', () => {
    it('should return passed=true with earned=3 when description is non-empty', () => {
      const result = checkDescriptionSet('A great project for Azure developers');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('hygiene');
      expect(result.signal).toBe('description_set');
    });

    it('should return passed=false with earned=0 when description is empty', () => {
      const result = checkDescriptionSet('');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when description is null', () => {
      const result = checkDescriptionSet(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkTopicsSet', () => {
    it('should return passed=true with earned=3 when topics exist', () => {
      const result = checkTopicsSet(['azure', 'typescript']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('hygiene');
      expect(result.signal).toBe('topics_set');
    });

    it('should return passed=false with earned=0 when topics array is empty', () => {
      const result = checkTopicsSet([]);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when topics is null/undefined', () => {
      const result = checkTopicsSet(null as unknown as string[]);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkNotArchived', () => {
    it('should return passed=true with earned=2 when repo is not archived', () => {
      const result = checkNotArchived(false);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
      expect(result.weight).toBe(2);
      expect(result.dimension).toBe('hygiene');
      expect(result.signal).toBe('not_archived');
    });

    it('should return passed=false with earned=0 when repo is archived', () => {
      const result = checkNotArchived(true);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkDefaultBranchIsMain', () => {
    it('should return passed=true with earned=1 when default branch is main', () => {
      const result = checkDefaultBranchIsMain('main');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(1);
      expect(result.weight).toBe(1);
      expect(result.dimension).toBe('hygiene');
      expect(result.signal).toBe('default_branch_main');
    });

    it('should return passed=false with earned=0 when default branch is master', () => {
      const result = checkDefaultBranchIsMain('master');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when default branch is develop', () => {
      const result = checkDefaultBranchIsMain('develop');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 3. CI/CD Presence ──────────────────────────────────────────────────────

describe('CI/CD Presence checks', () => {
  describe('checkHasWorkflows', () => {
    it('should return passed=true with earned=8 when workflows exist', () => {
      const result = checkHasWorkflows(3);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
      expect(result.weight).toBe(8);
      expect(result.dimension).toBe('ci_cd');
      expect(result.signal).toBe('has_workflows');
    });

    it('should return passed=true with earned=8 when exactly 1 workflow exists', () => {
      const result = checkHasWorkflows(1);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });

    it('should return passed=false with earned=0 when no workflows exist', () => {
      const result = checkHasWorkflows(0);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkRecentWorkflowSuccess', () => {
    it('should return passed=true with earned=7 when latest run succeeded', () => {
      const result = checkRecentWorkflowSuccess('success');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(7);
      expect(result.weight).toBe(7);
      expect(result.dimension).toBe('ci_cd');
      expect(result.signal).toBe('recent_workflow_success');
    });

    it('should return passed=false with earned=0 when latest run failed', () => {
      const result = checkRecentWorkflowSuccess('failure');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when conclusion is null (no runs)', () => {
      const result = checkRecentWorkflowSuccess(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkNoFailingWorkflows', () => {
    it('should return passed=true with earned=5 when no workflows are failing', () => {
      const result = checkNoFailingWorkflows(0);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('ci_cd');
      expect(result.signal).toBe('no_failing_workflows');
    });

    it('should return passed=false with earned=0 when some workflows are failing', () => {
      const result = checkNoFailingWorkflows(2);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 4. Dependency Freshness ─────────────────────────────────────────────────

describe('Dependency Freshness checks', () => {
  describe('checkLowCriticalDependabot', () => {
    it('should return passed=true with earned=8 when 0 critical alerts', () => {
      const result = checkLowCriticalDependabot(0);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
      expect(result.weight).toBe(8);
      expect(result.dimension).toBe('dependency_freshness');
      expect(result.signal).toBe('low_critical_dependabot');
    });

    it('should return passed=false with earned=0 when critical alerts > 0', () => {
      const result = checkLowCriticalDependabot(1);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when many critical alerts', () => {
      const result = checkLowCriticalDependabot(15);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkLowHighDependabot', () => {
    it('should return passed=true with earned=5 when high alerts <= 2', () => {
      const result = checkLowHighDependabot(2);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('dependency_freshness');
      expect(result.signal).toBe('low_high_dependabot');
    });

    it('should return passed=true with earned=5 when 0 high alerts', () => {
      const result = checkLowHighDependabot(0);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
    });

    it('should return passed=false with earned=0 when high alerts > 2', () => {
      const result = checkLowHighDependabot(3);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkAutomatedSecurityFixes', () => {
    it('should return passed=true with earned=3 when enabled', () => {
      const result = checkAutomatedSecurityFixes(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('dependency_freshness');
      expect(result.signal).toBe('automated_security_fixes');
    });

    it('should return passed=false with earned=0 when disabled', () => {
      const result = checkAutomatedSecurityFixes(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 5. Activity & Maintenance ───────────────────────────────────────────────

describe('Activity & Maintenance checks', () => {
  describe('checkRecentCommit', () => {
    it('should return passed=true with earned=8 when commit is within 6 months', () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 3);
      const result = checkRecentCommit(recentDate.toISOString());
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
      expect(result.weight).toBe(8);
      expect(result.dimension).toBe('activity');
      expect(result.signal).toBe('recent_commit');
    });

    it('should return passed=false with earned=0 when commit is older than 6 months', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8);
      const result = checkRecentCommit(oldDate.toISOString());
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when commit date is null', () => {
      const result = checkRecentCommit(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkRecentPush', () => {
    it('should return passed=true with earned=3 when push is within 6 months', () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 1);
      const result = checkRecentPush(recentDate.toISOString());
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('activity');
      expect(result.signal).toBe('recent_push');
    });

    it('should return passed=false with earned=0 when push is older than 6 months', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 1);
      const result = checkRecentPush(oldDate.toISOString());
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false with earned=0 when push date is null', () => {
      const result = checkRecentPush(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkManageableIssues', () => {
    it('should return passed=true with earned=3 when open issues <= 20', () => {
      const result = checkManageableIssues(15);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('activity');
      expect(result.signal).toBe('manageable_issues');
    });

    it('should return passed=true with earned=3 when exactly 20 open issues', () => {
      const result = checkManageableIssues(20);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
    });

    it('should return passed=false with earned=0 when open issues > 20', () => {
      const result = checkManageableIssues(21);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=true with earned=3 when 0 open issues', () => {
      const result = checkManageableIssues(0);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
    });
  });

  describe('checkHasReleases', () => {
    it('should return passed=true with earned=2 when releases exist', () => {
      const result = checkHasReleases(5);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
      expect(result.weight).toBe(2);
      expect(result.dimension).toBe('activity');
      expect(result.signal).toBe('has_releases');
    });

    it('should return passed=true with earned=2 when exactly 1 release', () => {
      const result = checkHasReleases(1);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
    });

    it('should return passed=false with earned=0 when 0 releases', () => {
      const result = checkHasReleases(0);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 6. Branch Protection ────────────────────────────────────────────────────

describe('Branch Protection checks', () => {
  describe('checkBranchProtected', () => {
    it('should return passed=true with earned=5 when branch protection is enabled', () => {
      const result = checkBranchProtected(true);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
      expect(result.weight).toBe(5);
      expect(result.dimension).toBe('branch_protection');
      expect(result.signal).toBe('branch_protected');
    });

    it('should return passed=false with earned=0 when branch protection is not enabled', () => {
      const result = checkBranchProtected(false);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ─── 7. Azure-Specific ──────────────────────────────────────────────────────

describe('Azure-Specific checks', () => {
  describe('checkHasAzureTopic', () => {
    it('should return passed=true with earned=3 when topics include azure', () => {
      const result = checkHasAzureTopic(['typescript', 'azure', 'sdk']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
      expect(result.weight).toBe(3);
      expect(result.dimension).toBe('azure');
      expect(result.signal).toBe('has_azure_topic');
    });

    it('should return passed=true when topics include azure-samples', () => {
      const result = checkHasAzureTopic(['azure-samples', 'javascript']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(3);
    });

    it('should return passed=false with earned=0 when no azure topic', () => {
      const result = checkHasAzureTopic(['typescript', 'nodejs']);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false when topics are empty', () => {
      const result = checkHasAzureTopic([]);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkHasLanguageTopics', () => {
    it('should return passed=true with earned=2 when topics include language names', () => {
      const result = checkHasLanguageTopics(['azure', 'javascript', 'sdk']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
      expect(result.weight).toBe(2);
      expect(result.dimension).toBe('azure');
      expect(result.signal).toBe('has_language_topics');
    });

    it('should return passed=true for typescript topic', () => {
      const result = checkHasLanguageTopics(['typescript']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
    });

    it('should return passed=true for python topic', () => {
      const result = checkHasLanguageTopics(['python', 'azure']);
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
    });

    it('should return passed=false when no language topics present', () => {
      const result = checkHasLanguageTopics(['azure', 'sdk', 'sample']);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false when topics are empty', () => {
      const result = checkHasLanguageTopics([]);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  describe('checkDescriptionMentionsAzure', () => {
    it('should return passed=true with earned=2 when description mentions Azure', () => {
      const result = checkDescriptionMentionsAzure('Sample app for Azure App Service');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
      expect(result.weight).toBe(2);
      expect(result.dimension).toBe('azure');
      expect(result.signal).toBe('description_mentions_azure');
    });

    it('should return passed=true when description mentions azure lowercase', () => {
      const result = checkDescriptionMentionsAzure('Deployed on azure functions');
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(2);
    });

    it('should return passed=false when description does not mention Azure', () => {
      const result = checkDescriptionMentionsAzure('A generic project for cloud deployments');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false when description is null', () => {
      const result = checkDescriptionMentionsAzure(null);
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should return passed=false when description is empty', () => {
      const result = checkDescriptionMentionsAzure('');
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});
