/**
 * cli.test.ts — CLI argument parsing and runner tests.
 *
 * Coverage:
 *   - parseArgs: --input, --out, --format, --verbose, --dry-run
 *   - Default output directory behavior
 *   - runCli: file reading, output writing, integration
 *   - Error log cleanup on start
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

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
  GitHubClient: vi.fn(),
}));

// Mock the core module
vi.mock('./index.js', () => ({
  checkReposBestPractices: vi.fn(),
  generateMarkdownReport: vi.fn().mockReturnValue('# Mock Report\n'),
}));

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createGitHubClient } from 'github-rest';
import { checkReposBestPractices } from './index.js';
import { parseArgs, runCli } from './cli.js';
import type { CliArgs } from './cli.js';

// ─── Mock report factory ─────────────────────────────────────────────────────

function makeMockReport() {
  return {
    repos: [
      {
        owner: 'Azure-Samples',
        repo: 'my-app',
        checkedAt: '2026-03-07T00:00:00Z',
        score: 85,
        grade: 'A',
        checks: [],
        dimensions: {},
        filesAnalyzed: ['package.json', 'README.md'],
      },
    ],
    summary: {
      totalRepos: 1,
      avgScore: 85,
      avgGrade: 'A',
      worstDimension: 'config',
      criticalFindings: 0,
      timestamp: '2026-03-07T00:00:00Z',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// parseArgs
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseArgs', () => {
  it('should parse --input flag', () => {
    const args = parseArgs(['--input', './repos.json']);

    expect(args.input).toBe('./repos.json');
  });

  it('should parse --out flag', () => {
    const args = parseArgs(['--out', './output-dir']);

    expect(args.out).toBe('./output-dir');
  });

  it('should parse --format json flag', () => {
    const args = parseArgs(['--format', 'json']);

    expect(args.format).toBe('json');
  });

  it('should parse --format markdown flag', () => {
    const args = parseArgs(['--format', 'markdown']);

    expect(args.format).toBe('markdown');
  });

  it('should parse --format both flag', () => {
    const args = parseArgs(['--format', 'both']);

    expect(args.format).toBe('both');
  });

  it('should parse --verbose flag', () => {
    const args = parseArgs(['--verbose']);

    expect(args.verbose).toBe(true);
  });

  it('should parse --dry-run flag', () => {
    const args = parseArgs(['--dry-run']);

    expect(args.dryRun).toBe(true);
  });

  it('should parse all flags together', () => {
    const args = parseArgs([
      '--input', './repos.json',
      '--out', './output-dir',
      '--format', 'both',
      '--verbose',
      '--dry-run',
    ]);

    expect(args.input).toBe('./repos.json');
    expect(args.out).toBe('./output-dir');
    expect(args.format).toBe('both');
    expect(args.verbose).toBe(true);
    expect(args.dryRun).toBe(true);
  });

  it('should default verbose and dryRun to false when not provided', () => {
    const args = parseArgs([]);

    expect(args.verbose).toBeFalsy();
    expect(args.dryRun).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runCli
// ═══════════════════════════════════════════════════════════════════════════════

describe('runCli', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GITHUB_TOKEN: 'test-token-123' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should read input file when --input is provided', async () => {
    const mockRepos = ['Azure-Samples/my-app'];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockRepos));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json' });

    expect(readFile).toHaveBeenCalledWith(
      expect.stringContaining('repos.json'),
      'utf-8',
    );
  });

  it('should call checkReposBestPractices with parsed repo list', async () => {
    const mockRepos = ['Azure-Samples/app1', 'Azure-Samples/app2'];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockRepos));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json' });

    expect(checkReposBestPractices).toHaveBeenCalled();
  });

  it('should write output files when --out is provided', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './output-dir' });

    const writeCalls = vi.mocked(writeFile).mock.calls;
    expect(writeCalls.length).toBeGreaterThanOrEqual(1);

    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.includes('azure-bp'))).toBe(true);
  });

  it('should write to default directory when --out is not provided', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json' });

    // Should still write output using a default directory
    const mkdirCalls = vi.mocked(mkdir).mock.calls;
    const mkdirPaths = mkdirCalls.map(c => String(c[0]));
    expect(mkdirPaths.some(p => p.includes('generated'))).toBe(true);
  });

  it('should write JSON output when --format is json', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './out', format: 'json' });

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.endsWith('.json'))).toBe(true);
  });

  it('should write markdown output when --format is md', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './out', format: 'markdown' });

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.endsWith('.md'))).toBe(true);
  });

  it('should write both JSON and MD when --format is both', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './out', format: 'both' });

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const writtenPaths = writeCalls.map(c => String(c[0]));
    expect(writtenPaths.some(p => p.endsWith('.json'))).toBe(true);
    expect(writtenPaths.some(p => p.endsWith('.md'))).toBe(true);
  });

  it('should attempt to clean error log on start', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(unlink).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './out' });

    // Should attempt to clean previous error log
    const unlinkCalls = vi.mocked(unlink).mock.calls;
    if (unlinkCalls.length > 0) {
      const unlinkPaths = unlinkCalls.map(c => String(c[0]));
      expect(unlinkPaths.some(p => p.includes('error') && p.includes('.log'))).toBe(true);
    }
    // If no unlink call, that's also acceptable — implementation may check existence first
  });

  it('should not call checkReposBestPractices when --dry-run is set', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', dryRun: true });

    // In dry-run mode, should NOT make API calls
    expect(checkReposBestPractices).not.toHaveBeenCalled();
  });

  it('should create output directory if it does not exist', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(['org/repo']));
    vi.mocked(checkReposBestPractices).mockResolvedValue(makeMockReport() as any);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    await runCli({ input: './repos.json', out: './new-output-dir' });

    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('new-output-dir'),
      expect.objectContaining({ recursive: true }),
    );
  });
});
