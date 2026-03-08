/**
 * Tests for CLI module.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from './cli.js';

describe('cli', () => {
  describe('parseArgs', () => {
    it('parses remediation input', () => {
      const args = parseArgs(['--remediation-input', 'remediation.json']);
      expect(args.remediationInput).toBe('remediation.json');
    });

    it('parses security input', () => {
      const args = parseArgs(['--security-input', 'security.json']);
      expect(args.securityInput).toBe('security.json');
    });

    it('parses health input', () => {
      const args = parseArgs(['--health-input', 'health.json']);
      expect(args.healthInput).toBe('health.json');
    });

    it('parses azure input', () => {
      const args = parseArgs(['--azure-input', 'azure.json']);
      expect(args.azureInput).toBe('azure.json');
    });

    it('parses output directory', () => {
      const args = parseArgs(['--out', 'output']);
      expect(args.out).toBe('output');
    });

    it('parses category list', () => {
      const args = parseArgs(['--category', 'missing-security-files,missing-azure-config']);
      expect(args.category).toBe('missing-security-files,missing-azure-config');
    });

    it('parses apply flag', () => {
      const args = parseArgs(['--apply']);
      expect(args.apply).toBe(true);
    });

    it('parses dry-run flag', () => {
      const args = parseArgs(['--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    it('parses verbose flag', () => {
      const args = parseArgs(['--verbose']);
      expect(args.verbose).toBe(true);
    });

    it('parses key=value style arguments', () => {
      const args = parseArgs([
        '--security-input=security.json',
        '--out=output',
        '--category=missing-security-files',
      ]);
      expect(args.securityInput).toBe('security.json');
      expect(args.out).toBe('output');
      expect(args.category).toBe('missing-security-files');
    });

    it('parses multiple flags together', () => {
      const args = parseArgs([
        '--security-input',
        'security.json',
        '--out',
        'output',
        '--apply',
        '--verbose',
      ]);
      expect(args.securityInput).toBe('security.json');
      expect(args.out).toBe('output');
      expect(args.apply).toBe(true);
      expect(args.verbose).toBe(true);
    });

    it('returns empty object for no arguments', () => {
      const args = parseArgs([]);
      expect(Object.keys(args)).toHaveLength(0);
    });
  });
});
