/**
 * Core test suite for pr-feedback-aggregator.
 *
 * Written test-first — defines contracts for:
 *   1. fetchPRComments: GitHub REST API integration
 *   2. extractPatterns: LLM-based pattern extraction
 *   3. aggregateResults: Cross-repo aggregation logic
 *   4. generateReport: Full pipeline orchestration
 *   5. generateMarkdownSummary: Report formatting
 *   6. Edge cases: empty inputs, bots, truncation
 *
 * Mock strategy:
 *   - vi.mock('github-rest') at module level — pullRequests namespace
 *   - vi.mock('llm-completion') at module level — callOpenAI
 *   - Mock data uses realistic GitHub REST API response shapes
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { GitHubClient } from 'github-rest';

// ─── Module-level mocks ──────────────────────────────────────────────────────

vi.mock('github-rest', () => ({
  pullRequests: {
    getPullRequestComments: vi.fn(),
  },
  createGitHubClient: vi.fn(),
  GitHubClient: vi.fn(),
}));

vi.mock('llm-completion', () => ({
  callOpenAI: vi.fn(),
}));

// ─── Imports (after mocking) ─────────────────────────────────────────────────

import { pullRequests, createGitHubClient } from 'github-rest';
import { callOpenAI } from 'llm-completion';

import {
  fetchPRComments,
  extractPatterns,
  aggregateResults,
  generateReport,
  generateMarkdownSummary,
  DEFAULT_MAX_PRS_PER_REPO,
  MAX_COMMENT_LENGTH,
  BOT_SUFFIXES,
} from './index.js';

import type {
  PRComment,
  FeedbackPattern,
  RepoFeedbackSummary,
  AggregatedReport,
  PRFeedbackOptions,
} from './types.js';

// ─── Mock Client Factory ─────────────────────────────────────────────────────

function createMockClient(): GitHubClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
    rawRequest: vi.fn(),
  } as unknown as GitHubClient;
}

// ─── Test Data Factories ─────────────────────────────────────────────────────

function makePRComment(overrides: Partial<PRComment> = {}): PRComment {
  return {
    author: 'reviewer1',
    body: 'Consider adding error handling for the async call.',
    createdAt: '2025-01-15T10:00:00Z',
    prNumber: 42,
    prTitle: 'Add new feature',
    repo: 'Azure-Samples/test-repo',
    ...overrides,
  };
}

function makeFeedbackPattern(overrides: Partial<FeedbackPattern> = {}): FeedbackPattern {
  return {
    theme: 'Missing error handling',
    frequency: 5,
    examples: ['Consider adding error handling', 'No try-catch around async call'],
    repos: ['Azure-Samples/test-repo'],
    severity: 'high',
    ...overrides,
  };
}

function makeGitHubPRListItem(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add new feature',
    state: 'closed',
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2025-01-15T12:00:00Z',
    user: { login: 'contributor1' },
    ...overrides,
  };
}

function makeGitHubIssueComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    body: 'Consider adding error handling for the async call.',
    created_at: '2025-01-15T10:00:00Z',
    user: { login: 'reviewer1' },
    ...overrides,
  };
}

function makeGitHubReviewComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 2001,
    body: 'This function needs better type annotations.',
    created_at: '2025-01-15T11:00:00Z',
    user: { login: 'reviewer2' },
    diff_hunk: '@@ -10,3 +10,5 @@',
    path: 'src/utils.ts',
    ...overrides,
  };
}

function makeLLMPatternResponse(patterns: Partial<FeedbackPattern>[] = []): string {
  const defaultPatterns: FeedbackPattern[] = patterns.length > 0
    ? patterns.map(p => makeFeedbackPattern(p))
    : [
        makeFeedbackPattern({ theme: 'Missing error handling', frequency: 5, severity: 'high' }),
        makeFeedbackPattern({ theme: 'Insufficient type annotations', frequency: 3, severity: 'medium' }),
      ];
  return JSON.stringify({ patterns: defaultPatterns });
}

// ─── fetchPRComments ─────────────────────────────────────────────────────────

describe('fetchPRComments', () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('should fetch comments from recent PRs for a repo', async () => {
    // Simulate client.get returning PR list, then getPullRequestComments for each
    vi.mocked(client.get).mockResolvedValueOnce([
      makeGitHubPRListItem({ number: 42 }),
      makeGitHubPRListItem({ number: 43, title: 'Fix bug' }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments)
      .mockResolvedValueOnce({
        issueComments: [makeGitHubIssueComment()],
        reviewComments: [makeGitHubReviewComment()],
      })
      .mockResolvedValueOnce({
        issueComments: [makeGitHubIssueComment({ body: 'LGTM', user: { login: 'approver' } })],
        reviewComments: [],
      });

    const comments = await fetchPRComments(client, 'Azure-Samples', 'test-repo', { maxPRs: 10 });

    expect(comments).toHaveLength(3);
    expect(comments[0]).toMatchObject({
      author: expect.any(String),
      body: expect.any(String),
      prNumber: expect.any(Number),
      repo: 'Azure-Samples/test-repo',
    });
  });

  it('should return empty array when repo has no PRs', async () => {
    vi.mocked(client.get).mockResolvedValueOnce([]);

    const comments = await fetchPRComments(client, 'Azure-Samples', 'empty-repo', { maxPRs: 10 });

    expect(comments).toEqual([]);
    expect(pullRequests.getPullRequestComments).not.toHaveBeenCalled();
  });

  it('should respect maxPRs limit', async () => {
    const prs = Array.from({ length: 20 }, (_, i) =>
      makeGitHubPRListItem({ number: i + 1 })
    );
    vi.mocked(client.get).mockResolvedValueOnce(prs);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [],
    });

    await fetchPRComments(client, 'Azure-Samples', 'big-repo', { maxPRs: 5 });

    expect(pullRequests.getPullRequestComments).toHaveBeenCalledTimes(5);
  });

  it('should handle pagination of PR list', async () => {
    // First page returns PRs, simulates that only maxPRs are processed
    vi.mocked(client.get).mockResolvedValueOnce([
      makeGitHubPRListItem({ number: 1 }),
      makeGitHubPRListItem({ number: 2 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [],
      reviewComments: [makeGitHubReviewComment()],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 2 });

    expect(comments).toHaveLength(2);
  });

  it('should handle rate limit errors gracefully', async () => {
    vi.mocked(client.get).mockRejectedValueOnce(
      Object.assign(new Error('API rate limit exceeded'), { status: 403 })
    );

    await expect(
      fetchPRComments(client, 'Azure-Samples', 'test-repo', { maxPRs: 10 })
    ).rejects.toThrow(/rate limit/i);
  });

  it('should filter PRs by since date when provided', async () => {
    const oldPR = makeGitHubPRListItem({
      number: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    });
    const newPR = makeGitHubPRListItem({
      number: 2,
      created_at: '2025-06-01T00:00:00Z',
      updated_at: '2025-06-15T00:00:00Z',
    });
    vi.mocked(client.get).mockResolvedValueOnce([oldPR, newPR]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', {
      maxPRs: 10,
      since: '2025-01-01T00:00:00Z',
    });

    // Should only fetch comments for the new PR
    expect(pullRequests.getPullRequestComments).toHaveBeenCalledTimes(1);
    expect(pullRequests.getPullRequestComments).toHaveBeenCalledWith(
      client, 'org', 'repo', 2
    );
  });

  it('should normalize comment fields into PRComment shape', async () => {
    vi.mocked(client.get).mockResolvedValueOnce([
      makeGitHubPRListItem({ number: 10, title: 'My PR' }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValueOnce({
      issueComments: [makeGitHubIssueComment({
        body: 'Needs tests',
        created_at: '2025-03-01T09:00:00Z',
        user: { login: 'alice' },
      })],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    expect(comments[0]).toEqual({
      author: 'alice',
      body: 'Needs tests',
      createdAt: '2025-03-01T09:00:00Z',
      prNumber: 10,
      prTitle: 'My PR',
      repo: 'org/repo',
    });
  });
});

// ─── extractPatterns ─────────────────────────────────────────────────────────

describe('extractPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract patterns from PR comments using LLM', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Missing error handling in the fetch call' }),
      makePRComment({ body: 'No try-catch around this async operation' }),
      makePRComment({ body: 'Add error handling here' }),
      makePRComment({ body: 'Types are missing on this function' }),
    ];

    vi.mocked(callOpenAI).mockResolvedValueOnce(makeLLMPatternResponse([
      { theme: 'Missing error handling', frequency: 3, severity: 'high' },
      { theme: 'Insufficient type annotations', frequency: 1, severity: 'medium' },
    ]));

    const patterns = await extractPatterns(comments);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toMatchObject({
      theme: expect.any(String),
      frequency: expect.any(Number),
      severity: expect.stringMatching(/^(high|medium|low)$/),
    });
    expect(callOpenAI).toHaveBeenCalledTimes(1);
  });

  it('should return empty patterns for empty comment list', async () => {
    const patterns = await extractPatterns([]);

    expect(patterns).toEqual([]);
    expect(callOpenAI).not.toHaveBeenCalled();
  });

  it('should handle LLM error with graceful fallback', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Missing error handling' }),
      makePRComment({ body: 'Missing error handling again' }),
    ];

    vi.mocked(callOpenAI).mockRejectedValueOnce(new Error('LLM service unavailable'));

    const patterns = await extractPatterns(comments);

    // Should return empty or fallback patterns rather than throwing
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should handle malformed LLM JSON response', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Some feedback' }),
    ];

    vi.mocked(callOpenAI).mockResolvedValueOnce('not valid json at all');

    const patterns = await extractPatterns(comments);

    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should group similar themes from LLM response', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Missing tests', prNumber: 1 }),
      makePRComment({ body: 'Need unit tests here', prNumber: 2 }),
      makePRComment({ body: 'No test coverage', prNumber: 3 }),
    ];

    vi.mocked(callOpenAI).mockResolvedValueOnce(makeLLMPatternResponse([
      {
        theme: 'Insufficient test coverage',
        frequency: 3,
        severity: 'high',
        examples: ['Missing tests', 'Need unit tests here', 'No test coverage'],
      },
    ]));

    const patterns = await extractPatterns(comments);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].theme).toBe('Insufficient test coverage');
    expect(patterns[0].frequency).toBe(3);
    expect(patterns[0].examples.length).toBeGreaterThanOrEqual(1);
  });

  it('should include repo information in extracted patterns', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Missing error handling', repo: 'org/repo-a' }),
      makePRComment({ body: 'No error handling', repo: 'org/repo-b' }),
    ];

    vi.mocked(callOpenAI).mockResolvedValueOnce(makeLLMPatternResponse([
      {
        theme: 'Missing error handling',
        frequency: 2,
        severity: 'high',
        repos: ['org/repo-a', 'org/repo-b'],
      },
    ]));

    const patterns = await extractPatterns(comments);

    expect(patterns[0].repos).toContain('org/repo-a');
    expect(patterns[0].repos).toContain('org/repo-b');
  });

  it('should pass comment bodies to LLM prompt', async () => {
    const comments: PRComment[] = [
      makePRComment({ body: 'Fix the error handling' }),
      makePRComment({ body: 'Add proper logging' }),
    ];

    vi.mocked(callOpenAI).mockResolvedValueOnce(makeLLMPatternResponse());

    await extractPatterns(comments);

    const promptArg = vi.mocked(callOpenAI).mock.calls[0][0];
    expect(promptArg).toContain('Fix the error handling');
    expect(promptArg).toContain('Add proper logging');
  });
});

// ─── aggregateResults ────────────────────────────────────────────────────────

describe('aggregateResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should aggregate patterns from a single repo', () => {
    const repoSummaries: RepoFeedbackSummary[] = [
      {
        repo: 'org/repo-a',
        prCount: 5,
        commentCount: 20,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 4 }),
          makeFeedbackPattern({ theme: 'No tests', frequency: 2 }),
        ],
      },
    ];

    const report = aggregateResults(repoSummaries);

    expect(report.repoCount).toBe(1);
    expect(report.topPatterns).toHaveLength(2);
    expect(report.perRepo).toHaveLength(1);
  });

  it('should aggregate patterns across multiple repos', () => {
    const repoSummaries: RepoFeedbackSummary[] = [
      {
        repo: 'org/repo-a',
        prCount: 5,
        commentCount: 15,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 3, repos: ['org/repo-a'] }),
        ],
      },
      {
        repo: 'org/repo-b',
        prCount: 3,
        commentCount: 10,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 2, repos: ['org/repo-b'] }),
          makeFeedbackPattern({ theme: 'Outdated dependencies', frequency: 1, repos: ['org/repo-b'] }),
        ],
      },
    ];

    const report = aggregateResults(repoSummaries);

    expect(report.repoCount).toBe(2);
    expect(report.totalPRs).toBe(8);
    expect(report.totalComments).toBe(25);
  });

  it('should deduplicate same theme across repos by merging frequencies', () => {
    const repoSummaries: RepoFeedbackSummary[] = [
      {
        repo: 'org/repo-a',
        prCount: 5,
        commentCount: 10,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 3, repos: ['org/repo-a'] }),
        ],
      },
      {
        repo: 'org/repo-b',
        prCount: 3,
        commentCount: 8,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 2, repos: ['org/repo-b'] }),
        ],
      },
    ];

    const report = aggregateResults(repoSummaries);

    // Same theme should be merged — total frequency combined
    const errorHandling = report.topPatterns.find(p => p.theme === 'Missing error handling');
    expect(errorHandling).toBeDefined();
    expect(errorHandling!.frequency).toBe(5);
    expect(errorHandling!.repos).toContain('org/repo-a');
    expect(errorHandling!.repos).toContain('org/repo-b');
  });

  it('should sort topPatterns by frequency descending', () => {
    const repoSummaries: RepoFeedbackSummary[] = [
      {
        repo: 'org/repo-a',
        prCount: 10,
        commentCount: 30,
        patterns: [
          makeFeedbackPattern({ theme: 'Low frequency issue', frequency: 1 }),
          makeFeedbackPattern({ theme: 'High frequency issue', frequency: 10 }),
          makeFeedbackPattern({ theme: 'Medium frequency issue', frequency: 5 }),
        ],
      },
    ];

    const report = aggregateResults(repoSummaries);

    expect(report.topPatterns[0].theme).toBe('High frequency issue');
    expect(report.topPatterns[1].theme).toBe('Medium frequency issue');
    expect(report.topPatterns[2].theme).toBe('Low frequency issue');
  });

  it('should include generatedAt timestamp', () => {
    const before = new Date().toISOString();

    const report = aggregateResults([{
      repo: 'org/repo',
      prCount: 1,
      commentCount: 1,
      patterns: [],
    }]);

    expect(report.generatedAt).toBeDefined();
    expect(new Date(report.generatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('should generate recommendations from top patterns', () => {
    const repoSummaries: RepoFeedbackSummary[] = [
      {
        repo: 'org/repo-a',
        prCount: 10,
        commentCount: 50,
        patterns: [
          makeFeedbackPattern({ theme: 'Missing error handling', frequency: 15, severity: 'high' }),
          makeFeedbackPattern({ theme: 'No tests', frequency: 8, severity: 'medium' }),
        ],
      },
    ];

    const report = aggregateResults(repoSummaries);

    expect(report.recommendations).toBeDefined();
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should handle empty repo summaries list', () => {
    const report = aggregateResults([]);

    expect(report.repoCount).toBe(0);
    expect(report.totalPRs).toBe(0);
    expect(report.totalComments).toBe(0);
    expect(report.topPatterns).toEqual([]);
    expect(report.perRepo).toEqual([]);
    expect(report.recommendations).toEqual([]);
  });
});

// ─── generateReport ──────────────────────────────────────────────────────────

describe('generateReport', () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('should run the full pipeline and return AggregatedReport', async () => {
    // Setup: one repo with one PR and one comment
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment({ body: 'Add error handling' })],
      reviewComments: [],
    });
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse([
      { theme: 'Missing error handling', frequency: 1, severity: 'medium' },
    ]));

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    expect(report.repoCount).toBe(1);
    expect(report.topPatterns.length).toBeGreaterThanOrEqual(1);
    expect(report.generatedAt).toBeDefined();
  });

  it('should include metadata fields in the report', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem(),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [makeGitHubReviewComment()],
    });
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse());

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('repoCount');
    expect(report).toHaveProperty('totalPRs');
    expect(report).toHaveProperty('totalComments');
    expect(report).toHaveProperty('topPatterns');
    expect(report).toHaveProperty('perRepo');
    expect(report).toHaveProperty('recommendations');
  });

  it('should respect maxPRsPerRepo option', async () => {
    const prs = Array.from({ length: 20 }, (_, i) =>
      makeGitHubPRListItem({ number: i + 1 })
    );
    vi.mocked(client.get).mockResolvedValue(prs);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [],
    });
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse());

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 3,
      token: 'ghp_test_token',
    };

    await generateReport(client, options);

    // Should only process 3 PRs
    expect(pullRequests.getPullRequestComments).toHaveBeenCalledTimes(3);
  });

  it('should process multiple repos', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [],
    });
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse());

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a', 'org/repo-b', 'org/repo-c'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    expect(report.repoCount).toBe(3);
    expect(report.perRepo).toHaveLength(3);
  });

  it('should handle dry-run mode by skipping LLM calls', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment()],
      reviewComments: [],
    });

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a'],
      outputDir: './output',
      dryRun: true,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    // Dry-run should still fetch comments but may skip LLM
    expect(report).toBeDefined();
    expect(report.repoCount).toBe(1);
  });

  it('should pass since option through to fetchPRComments', async () => {
    vi.mocked(client.get).mockResolvedValue([]);
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse());

    const options: PRFeedbackOptions = {
      repos: ['org/repo-a'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      since: '2025-06-01T00:00:00Z',
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    // The client.get call for PR list should include since parameter
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('since=')
    );
  });
});

// ─── generateMarkdownSummary ─────────────────────────────────────────────────

describe('generateMarkdownSummary', () => {
  it('should format top themes as markdown headings', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 2,
      totalPRs: 10,
      totalComments: 50,
      topPatterns: [
        makeFeedbackPattern({ theme: 'Missing error handling', frequency: 8, severity: 'high' }),
        makeFeedbackPattern({ theme: 'No tests', frequency: 3, severity: 'medium' }),
      ],
      perRepo: [
        { repo: 'org/repo-a', prCount: 5, commentCount: 30, patterns: [] },
        { repo: 'org/repo-b', prCount: 5, commentCount: 20, patterns: [] },
      ],
      recommendations: ['Add error handling guidelines to CONTRIBUTING.md'],
    };

    const md = generateMarkdownSummary(report);

    expect(md).toContain('Missing error handling');
    expect(md).toContain('No tests');
    expect(md).toContain('#'); // Markdown headings
  });

  it('should include repo breakdown section', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 2,
      totalPRs: 8,
      totalComments: 25,
      topPatterns: [makeFeedbackPattern()],
      perRepo: [
        { repo: 'org/repo-a', prCount: 5, commentCount: 15, patterns: [makeFeedbackPattern()] },
        { repo: 'org/repo-b', prCount: 3, commentCount: 10, patterns: [] },
      ],
      recommendations: [],
    };

    const md = generateMarkdownSummary(report);

    expect(md).toContain('org/repo-a');
    expect(md).toContain('org/repo-b');
  });

  it('should include summary statistics', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 3,
      totalPRs: 15,
      totalComments: 75,
      topPatterns: [],
      perRepo: [],
      recommendations: [],
    };

    const md = generateMarkdownSummary(report);

    expect(md).toContain('3');   // repoCount
    expect(md).toContain('15');  // totalPRs
    expect(md).toContain('75');  // totalComments
  });

  it('should include recommendations section', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 1,
      totalPRs: 5,
      totalComments: 20,
      topPatterns: [makeFeedbackPattern()],
      perRepo: [{ repo: 'org/repo', prCount: 5, commentCount: 20, patterns: [] }],
      recommendations: [
        'Add error handling guidelines to CONTRIBUTING.md',
        'Create linting rules for type annotations',
      ],
    };

    const md = generateMarkdownSummary(report);

    expect(md).toContain('Add error handling guidelines');
    expect(md).toContain('Create linting rules');
  });

  it('should show severity for each pattern', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 1,
      totalPRs: 5,
      totalComments: 20,
      topPatterns: [
        makeFeedbackPattern({ theme: 'Critical issue', severity: 'high' }),
        makeFeedbackPattern({ theme: 'Minor issue', severity: 'low' }),
      ],
      perRepo: [],
      recommendations: [],
    };

    const md = generateMarkdownSummary(report);

    expect(md).toContain('high');
    expect(md).toContain('low');
  });

  it('should handle empty report gracefully', () => {
    const report: AggregatedReport = {
      generatedAt: '2025-06-15T12:00:00Z',
      repoCount: 0,
      totalPRs: 0,
      totalComments: 0,
      topPatterns: [],
      perRepo: [],
      recommendations: [],
    };

    const md = generateMarkdownSummary(report);

    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('should handle empty repo list in options', async () => {
    const options: PRFeedbackOptions = {
      repos: [],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    expect(report.repoCount).toBe(0);
    expect(report.topPatterns).toEqual([]);
    expect(report.perRepo).toEqual([]);
  });

  it('should handle repo with no PRs at all', async () => {
    vi.mocked(client.get).mockResolvedValue([]);

    const options: PRFeedbackOptions = {
      repos: ['org/empty-repo'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    const report = await generateReport(client, options);

    expect(report.repoCount).toBe(1);
    expect(report.totalPRs).toBe(0);
    expect(report.totalComments).toBe(0);
    expect(report.perRepo[0].prCount).toBe(0);
  });

  it('should filter out bot comments', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [
        makeGitHubIssueComment({ body: 'Real review comment', user: { login: 'human-reviewer' } }),
        makeGitHubIssueComment({ body: 'Automated coverage report', user: { login: 'codecov[bot]' } }),
        makeGitHubIssueComment({ body: 'Dependency update', user: { login: 'dependabot[bot]' } }),
        makeGitHubIssueComment({ body: 'Build passed', user: { login: 'github-actions[bot]' } }),
      ],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    // Should only include the human comment
    expect(comments).toHaveLength(1);
    expect(comments[0].author).toBe('human-reviewer');
  });

  it('should filter out comments from renovate bot', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [
        makeGitHubIssueComment({ body: 'Renovate update', user: { login: 'renovate[bot]' } }),
        makeGitHubIssueComment({ body: 'Actual feedback', user: { login: 'reviewer' } }),
      ],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    expect(comments).toHaveLength(1);
    expect(comments[0].author).toBe('reviewer');
  });

  it('should truncate very large comment bodies', async () => {
    const longBody = 'A'.repeat(50000);

    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [makeGitHubIssueComment({ body: longBody })],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    expect(comments[0].body.length).toBeLessThanOrEqual(MAX_COMMENT_LENGTH);
  });

  it('should skip comments with empty body', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [
        makeGitHubIssueComment({ body: '' }),
        makeGitHubIssueComment({ body: null }),
        makeGitHubIssueComment({ body: 'Actual feedback' }),
      ],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('Actual feedback');
  });

  it('should handle repo not found (404) gracefully', async () => {
    vi.mocked(client.get).mockRejectedValue(
      Object.assign(new Error('Not Found'), { status: 404 })
    );

    const options: PRFeedbackOptions = {
      repos: ['org/nonexistent-repo'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    // Should handle gracefully — not crash entire pipeline
    const report = await generateReport(client, options);

    expect(report.repoCount).toBe(1);
    expect(report.perRepo[0].commentCount).toBe(0);
  });

  it('should handle missing user field in comment gracefully', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [
        makeGitHubIssueComment({ body: 'Ghost comment', user: null }),
        makeGitHubIssueComment({ body: 'Normal comment', user: { login: 'reviewer' } }),
      ],
      reviewComments: [],
    });

    const comments = await fetchPRComments(client, 'org', 'repo', { maxPRs: 10 });

    // Should handle null user — either skip or default to 'unknown'
    const authors = comments.map(c => c.author);
    expect(authors).toContain('reviewer');
  });

  it('should not call LLM when all comments are filtered out', async () => {
    vi.mocked(client.get).mockResolvedValue([
      makeGitHubPRListItem({ number: 1 }),
    ]);
    vi.mocked(pullRequests.getPullRequestComments).mockResolvedValue({
      issueComments: [
        makeGitHubIssueComment({ body: 'Bot message', user: { login: 'dependabot[bot]' } }),
      ],
      reviewComments: [],
    });
    vi.mocked(callOpenAI).mockResolvedValue(makeLLMPatternResponse());

    const options: PRFeedbackOptions = {
      repos: ['org/repo'],
      outputDir: './output',
      dryRun: false,
      verbose: false,
      maxPRsPerRepo: 10,
      token: 'ghp_test_token',
    };

    await generateReport(client, options);

    // No human comments → no LLM call needed
    expect(callOpenAI).not.toHaveBeenCalled();
  });
});

// ─── Constants and Exports ───────────────────────────────────────────────────

describe('constants and exports', () => {
  it('should export DEFAULT_MAX_PRS_PER_REPO as a positive number', () => {
    expect(DEFAULT_MAX_PRS_PER_REPO).toBeDefined();
    expect(typeof DEFAULT_MAX_PRS_PER_REPO).toBe('number');
    expect(DEFAULT_MAX_PRS_PER_REPO).toBeGreaterThan(0);
  });

  it('should export MAX_COMMENT_LENGTH as a positive number', () => {
    expect(MAX_COMMENT_LENGTH).toBeDefined();
    expect(typeof MAX_COMMENT_LENGTH).toBe('number');
    expect(MAX_COMMENT_LENGTH).toBeGreaterThan(0);
  });

  it('should export BOT_SUFFIXES as an array of bot identifier patterns', () => {
    expect(BOT_SUFFIXES).toBeDefined();
    expect(Array.isArray(BOT_SUFFIXES)).toBe(true);
    expect(BOT_SUFFIXES.length).toBeGreaterThan(0);
    expect(BOT_SUFFIXES).toContain('[bot]');
  });

  it('should export fetchPRComments function', () => {
    expect(typeof fetchPRComments).toBe('function');
  });

  it('should export extractPatterns function', () => {
    expect(typeof extractPatterns).toBe('function');
  });

  it('should export aggregateResults function', () => {
    expect(typeof aggregateResults).toBe('function');
  });

  it('should export generateReport function', () => {
    expect(typeof generateReport).toBe('function');
  });

  it('should export generateMarkdownSummary function', () => {
    expect(typeof generateMarkdownSummary).toBe('function');
  });
});
