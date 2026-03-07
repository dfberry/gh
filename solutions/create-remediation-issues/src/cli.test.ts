/**
 * CLI tests for create-remediation-issues.
 *
 * Tests parseArgs and runCli behavior including:
 * - Argument parsing
 * - Input file reading
 * - Output file writing
 * - Integration with core createRemediationIssues function
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

// Mock github-rest
vi.mock('github-rest', () => ({
  createGitHubClient: vi.fn(),
  issues: {
    createIssue: vi.fn(),
    listIssues: vi.fn(),
    addLabelsToIssue: vi.fn(),
    createLabel: vi.fn(),
    listLabels: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Mock the core module
vi.mock('./index.js', () => ({
  createRemediationIssues: vi.fn(),
  DEFAULT_SECURITY_SCORE_THRESHOLD: 70,
  DEFAULT_HEALTH_GRADE_THRESHOLD: 'D',
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createGitHubClient } from 'github-rest';
import { createRemediationIssues } from './index.js';
import { parseArgs, runCli } from './cli.js';
import type { CliArgs } from './cli.js';

describe('parseArgs', () => {
  it('should parse --security-input flag', () => {
    const args = parseArgs(['--security-input', './security-report.json']);

    expect(args.securityInput).toBe('./security-report.json');
  });

  it('should parse --health-input flag', () => {
    const args = parseArgs(['--health-input', './health-report.json']);

    expect(args.healthInput).toBe('./health-report.json');
  });

  it('should parse --out flag', () => {
    const args = parseArgs(['--out', './output-dir']);

    expect(args.out).toBe('./output-dir');
  });

  it('should parse --dry-run flag', () => {
    const args = parseArgs(['--dry-run']);

    expect(args.dryRun).toBe(true);
  });

  it('should parse --security-score-threshold flag', () => {
    const args = parseArgs(['--security-score-threshold', '50']);

    expect(args.securityScoreThreshold).toBe(50);
  });

  it('should parse --health-grade-threshold flag', () => {
    const args = parseArgs(['--health-grade-threshold', 'C']);

    expect(args.healthGradeThreshold).toBe('C');
  });

  it('should parse --extra-labels as comma-separated list', () => {
    const args = parseArgs(['--extra-labels', 'priority:p1,team:devrel']);

    expect(args.extraLabels).toEqual(['priority:p1', 'team:devrel']);
  });

  it('should parse --verbose flag', () => {
    const args = parseArgs(['--verbose']);

    expect(args.verbose).toBe(true);
  });

  it('should parse multiple flags together', () => {
    const args = parseArgs([
      '--security-input', './sec.json',
      '--health-input', './health.json',
      '--out', './output-dir',
      '--dry-run',
      '--verbose',
    ]);

    expect(args.securityInput).toBe('./sec.json');
    expect(args.healthInput).toBe('./health.json');
    expect(args.out).toBe('./output-dir');
    expect(args.dryRun).toBe(true);
    expect(args.verbose).toBe(true);
  });
});

describe('runCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read security input file when provided', async () => {
    const mockReport = { repos: [], summary: { totalRepos: 0 } };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockReport));
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      securityInput: './security-report.json',
      dryRun: true,
    });

    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining('security-report.json'),
      'utf-8',
    );
  });

  it('should read health input file when provided', async () => {
    const mockReport = { repos: [], summary: { totalRepos: 0 } };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockReport));
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      healthInput: './health-report.json',
      dryRun: true,
    });

    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining('health-report.json'),
      'utf-8',
    );
  });

  it('should write output summary when --out is provided', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ repos: [], summary: {} }));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      securityInput: './sec.json',
      out: './output-dir',
      dryRun: true,
    });

    // Should write both JSON and MD with timestamped filenames
    const writeCalls = vi.mocked(writeFile).mock.calls;
    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.includes('remediation.json'))).toBe(true);
    expect(writtenPaths.some(p => p.includes('remediation.md'))).toBe(true);
  });

  it('should write output to default directory when --out is not provided', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ repos: [], summary: {} }));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      securityInput: './sec.json',
      dryRun: true,
    });

    // Should still write output using default directory
    const mkdirCalls = vi.mocked(mkdir).mock.calls;
    const mkdirPaths = mkdirCalls.map(c => String(c[0]));
    expect(mkdirPaths.some(p => p.includes('generated'))).toBe(true);

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.includes('remediation.json'))).toBe(true);
  });

  it('should pass dry-run option to createRemediationIssues', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ repos: [], summary: {} }));
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      securityInput: './sec.json',
      dryRun: true,
    });

    expect(createRemediationIssues).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('should pass threshold options to createRemediationIssues', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ repos: [], summary: {} }));
    vi.mocked(createRemediationIssues).mockResolvedValue({
      created: [], skipped: [], planned: [], dryRun: true,
      summary: { totalPlanned: 0, totalCreated: 0, totalSkipped: 0, timestamp: '' },
    } as any);

    await runCli({
      securityInput: './sec.json',
      dryRun: true,
      securityScoreThreshold: 50,
      healthGradeThreshold: 'C',
    });

    expect(createRemediationIssues).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        securityScoreThreshold: 50,
        healthGradeThreshold: 'C',
      }),
    );
  });
});
