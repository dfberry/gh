/**
 * CLI tests for pr-feedback-aggregator.
 *
 * Tests parseArgs and runCli behavior including:
 * - Argument parsing for all flags
 * - Input file reading
 * - Output file writing
 * - Validation rules
 * - Environment variable checks
 * - Integration with core generateReport function
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock github-rest
vi.mock('github-rest', () => ({
  createGitHubClient: vi.fn(),
  pullRequests: {
    getPullRequestComments: vi.fn(),
  },
  GitHubClient: vi.fn(),
}));

// Mock llm-completion
vi.mock('llm-completion', () => ({
  callOpenAI: vi.fn(),
}));

// Mock the core module
vi.mock('./index.js', () => ({
  generateReport: vi.fn(),
  generateMarkdownSummary: vi.fn(),
  DEFAULT_MAX_PRS_PER_REPO: 20,
  MAX_COMMENT_LENGTH: 10000,
  BOT_SUFFIXES: ['[bot]'],
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createGitHubClient } from 'github-rest';
import { generateReport, generateMarkdownSummary } from './index.js';
import { parseArgs, runCli } from './cli.js';

import type { AggregatedReport } from './types.js';

// ─── Test Data ───────────────────────────────────────────────────────────────

function makeEmptyReport(): AggregatedReport {
  return {
    generatedAt: '2025-06-15T12:00:00Z',
    repoCount: 0,
    totalPRs: 0,
    totalComments: 0,
    topPatterns: [],
    perRepo: [],
    recommendations: [],
  };
}

// ─── parseArgs ───────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('should parse --input flag as required', () => {
    const args = parseArgs(['--input', './repos.json']);

    expect(args.input).toBe('./repos.json');
  });

  it('should parse --out flag with default', () => {
    const args = parseArgs(['--input', './repos.json']);

    // Should have a default output directory
    expect(args.out).toBeDefined();
    expect(typeof args.out).toBe('string');
  });

  it('should parse explicit --out flag', () => {
    const args = parseArgs(['--input', './repos.json', '--out', './custom-output']);

    expect(args.out).toBe('./custom-output');
  });

  it('should parse --dry-run flag', () => {
    const args = parseArgs(['--input', './repos.json', '--dry-run']);

    expect(args.dryRun).toBe(true);
  });

  it('should parse --verbose flag', () => {
    const args = parseArgs(['--input', './repos.json', '--verbose']);

    expect(args.verbose).toBe(true);
  });

  it('should parse --max-prs flag as positive integer', () => {
    const args = parseArgs(['--input', './repos.json', '--max-prs', '15']);

    expect(args.maxPRsPerRepo).toBe(15);
  });

  it('should reject --max-prs with non-positive value', () => {
    expect(() => parseArgs(['--input', './repos.json', '--max-prs', '0'])).toThrow();
  });

  it('should reject --max-prs with non-integer value', () => {
    expect(() => parseArgs(['--input', './repos.json', '--max-prs', '3.5'])).toThrow();
  });

  it('should parse --since flag as ISO date string', () => {
    const args = parseArgs(['--input', './repos.json', '--since', '2025-01-01']);

    expect(args.since).toBe('2025-01-01');
  });

  it('should reject --since with invalid date format', () => {
    expect(() => parseArgs(['--input', './repos.json', '--since', 'not-a-date'])).toThrow();
  });

  it('should parse all flags together', () => {
    const args = parseArgs([
      '--input', './repos.json',
      '--out', './output',
      '--dry-run',
      '--verbose',
      '--max-prs', '5',
      '--since', '2025-06-01',
    ]);

    expect(args.input).toBe('./repos.json');
    expect(args.out).toBe('./output');
    expect(args.dryRun).toBe(true);
    expect(args.verbose).toBe(true);
    expect(args.maxPRsPerRepo).toBe(5);
    expect(args.since).toBe('2025-06-01');
  });

  it('should default dry-run to false', () => {
    const args = parseArgs(['--input', './repos.json']);

    expect(args.dryRun).toBe(false);
  });

  it('should default verbose to false', () => {
    const args = parseArgs(['--input', './repos.json']);

    expect(args.verbose).toBe(false);
  });
});

// ─── runCli ──────────────────────────────────────────────────────────────────

describe('runCli', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GITHUB_TOKEN: 'ghp_test_token' };
  });

  it('should read repo list from input file', async () => {
    const repoList = ['org/repo-a', 'org/repo-b'];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(repoList));
    vi.mocked(generateReport).mockResolvedValue(makeEmptyReport());
    vi.mocked(generateMarkdownSummary).mockReturnValue('# Report');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await runCli({
      input: './repos.json',
      out: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
    });

    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining('repos.json'),
      'utf-8',
    );
  });

  it('should write JSON report to output directory', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(generateReport).mockResolvedValue(makeEmptyReport());
    vi.mocked(generateMarkdownSummary).mockReturnValue('# Report');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await runCli({
      input: './repos.json',
      out: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
    });

    expect(writeFile).toHaveBeenCalled();
    // Should write JSON output
    const writeCall = vi.mocked(writeFile).mock.calls.find(
      call => String(call[0]).endsWith('.json')
    );
    expect(writeCall).toBeDefined();
  });

  it('should write markdown summary to output directory', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(generateReport).mockResolvedValue(makeEmptyReport());
    vi.mocked(generateMarkdownSummary).mockReturnValue('# PR Feedback Report');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await runCli({
      input: './repos.json',
      out: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
    });

    // Should write markdown file
    const mdCall = vi.mocked(writeFile).mock.calls.find(
      call => String(call[0]).endsWith('.md')
    );
    expect(mdCall).toBeDefined();
  });

  it('should pass options through to generateReport', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(generateReport).mockResolvedValue(makeEmptyReport());
    vi.mocked(generateMarkdownSummary).mockReturnValue('# Report');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await runCli({
      input: './repos.json',
      out: './output',
      dryRun: true,
      verbose: true,
      maxPRsPerRepo: 5,
      since: '2025-01-01',
    });

    expect(generateReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dryRun: true,
        verbose: true,
        maxPRsPerRepo: 5,
        since: '2025-01-01',
      }),
    );
  });

  it('should error when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(
      runCli({
        input: './repos.json',
        out: './output',
        dryRun: false,
        verbose: false,
        maxPRsPerRepo: 10,
      })
    ).rejects.toThrow(/GITHUB_TOKEN/i);
  });

  it('should create output directory if it does not exist', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(generateReport).mockResolvedValue(makeEmptyReport());
    vi.mocked(generateMarkdownSummary).mockReturnValue('# Report');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await runCli({
      input: './repos.json',
      out: './output/subdir',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
    });

    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('output'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('should handle invalid JSON in input file', async () => {
    vi.mocked(readFile).mockResolvedValue('not valid json {{{');

    await expect(
      runCli({
        input: './repos.json',
        out: './output',
        dryRun: false,
        verbose: false,
        maxPRsPerRepo: 10,
      })
    ).rejects.toThrow();
  });
});
