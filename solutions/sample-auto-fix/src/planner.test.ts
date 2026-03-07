/**
 * Tests for planner module.
 */

import { describe, it, expect } from 'vitest';
import { buildFixPlans } from './planner.js';
import type { FixableFinding } from './types.js';

describe('planner', () => {
  describe('buildFixPlans', () => {
    it('builds fix plans from grouped findings', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md', '.env.example'],
          source: 'security',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({
        owner: 'org',
        repo: 'repo1',
        category: 'missing-security-files',
      });
      expect(plans[0].branch).toMatch(/^autofix\/missing-security-files-\d{8}$/);
      expect(plans[0].templates).toHaveLength(2);
    });

    it('creates separate plans for different categories in same repo', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md'],
          source: 'security',
        },
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-azure-config',
          missingFiles: ['azure.yaml'],
          source: 'azure',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans).toHaveLength(2);
      expect(plans[0].category).toBe('missing-security-files');
      expect(plans[1].category).toBe('missing-azure-config');
    });

    it('merges missing files from same category', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md'],
          source: 'security',
        },
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['.env.example'],
          source: 'health',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans).toHaveLength(1);
      expect(plans[0].templates).toHaveLength(2);
      expect(plans[0].templates.map(t => t.path)).toContain('SECURITY.md');
      expect(plans[0].templates.map(t => t.path)).toContain('.env.example');
    });

    it('generates correct PR title for security files', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md'],
          source: 'security',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans[0].prTitle).toBe('[auto-fix] Add missing security file');
    });

    it('generates correct PR title for multiple files', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md', '.env.example'],
          source: 'security',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans[0].prTitle).toBe('[auto-fix] Add missing security files');
    });

    it('generates PR body with file list', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md', '.env.example'],
          source: 'security',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans[0].prBody).toContain('SECURITY.md');
      expect(plans[0].prBody).toContain('.env.example');
      expect(plans[0].prBody).toContain('sample-auto-fix');
    });

    it('includes correct templates for each file', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-security-files',
          missingFiles: ['SECURITY.md', '.env.example', '.github/dependabot.yml'],
          source: 'security',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans[0].templates).toHaveLength(3);
      
      const securityTemplate = plans[0].templates.find(t => t.path === 'SECURITY.md');
      expect(securityTemplate).toBeDefined();
      expect(securityTemplate?.content).toContain('Security Policy');
      
      const envTemplate = plans[0].templates.find(t => t.path === '.env.example');
      expect(envTemplate).toBeDefined();
      expect(envTemplate?.content).toContain('GITHUB_TOKEN');
      
      const dependabotTemplate = plans[0].templates.find(t => t.path === '.github/dependabot.yml');
      expect(dependabotTemplate).toBeDefined();
      expect(dependabotTemplate?.content).toContain('version: 2');
    });

    it('includes Azure template for azure config', () => {
      const findings: FixableFinding[] = [
        {
          owner: 'org',
          repo: 'repo1',
          category: 'missing-azure-config',
          missingFiles: ['azure.yaml'],
          source: 'azure',
        },
      ];

      const grouped = new Map();
      grouped.set('org/repo1', findings);

      const plans = buildFixPlans(grouped);

      expect(plans[0].templates).toHaveLength(1);
      expect(plans[0].templates[0].path).toBe('azure.yaml');
      expect(plans[0].templates[0].content).toContain('Azure Developer CLI');
    });
  });
});
