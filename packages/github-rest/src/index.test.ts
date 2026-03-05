import { describe, it, expect } from 'vitest';
import * as pkg from './index.js';

describe('package exports', () => {
  it('exports alerts namespace', () => {
    expect(pkg.alerts).toBeDefined();
    expect(typeof pkg.alerts).toBe('object');
  });

  it('exports contents namespace', () => {
    expect(pkg.contents).toBeDefined();
    expect(typeof pkg.contents).toBe('object');
  });

  it('exports orgs namespace', () => {
    expect(pkg.orgs).toBeDefined();
    expect(typeof pkg.orgs).toBe('object');
  });

  it('exports issues namespace', () => {
    expect(pkg.issues).toBeDefined();
    expect(typeof pkg.issues).toBe('object');
  });

  it('alerts namespace has expected functions', () => {
    expect(typeof pkg.alerts.listDependabotAlerts).toBe('function');
    expect(typeof pkg.alerts.listCodeScanningAlerts).toBe('function');
    expect(typeof pkg.alerts.listSecretScanningAlerts).toBe('function');
  });

  it('contents namespace has expected functions', () => {
    expect(typeof pkg.contents.getRootContents).toBe('function');
  });

  it('orgs namespace has expected functions', () => {
    expect(typeof pkg.orgs.getUserOrganizations).toBe('function');
  });

  it('issues namespace has expected functions', () => {
    expect(typeof pkg.issues.createIssue).toBe('function');
    expect(typeof pkg.issues.listIssues).toBe('function');
    expect(typeof pkg.issues.getIssue).toBe('function');
    expect(typeof pkg.issues.updateIssue).toBe('function');
    expect(typeof pkg.issues.addLabelsToIssue).toBe('function');
    expect(typeof pkg.issues.createLabel).toBe('function');
    expect(typeof pkg.issues.listLabels).toBe('function');
  });

  // Existing exports should still work
  it('exports GitHubClient class', () => {
    expect(pkg.GitHubClient).toBeDefined();
  });

  it('exports repos namespace', () => {
    expect(pkg.repos).toBeDefined();
  });

  it('exports permissions namespace', () => {
    expect(pkg.permissions).toBeDefined();
  });
});
