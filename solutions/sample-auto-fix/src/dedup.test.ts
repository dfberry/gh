/**
 * Tests for dedup module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForExistingPR, hasExistingAutoFixPR } from './dedup.js';
import type { GitHubClient } from 'github-rest';

// Mock repos module
vi.mock('github-rest', async () => {
  const actual = await vi.importActual('github-rest');
  return {
    ...actual,
    repos: {
      findPRByBranch: vi.fn(),
    },
  };
});

describe('dedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkForExistingPR', () => {
    it('returns PR number when PR exists', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(42);
      
      const prNumber = await checkForExistingPR(mockClient, 'org', 'repo', 'autofix-branch');

      expect(prNumber).toBe(42);
    });

    it('returns null when PR does not exist', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(null);
      
      const prNumber = await checkForExistingPR(mockClient, 'org', 'repo', 'autofix-branch');

      expect(prNumber).toBe(null);
    });

    it('returns null on error (fail-safe)', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockRejectedValue(new Error('API error'));
      
      const prNumber = await checkForExistingPR(mockClient, 'org', 'repo', 'autofix-branch');

      expect(prNumber).toBe(null);
    });
  });

  describe('hasExistingAutoFixPR', () => {
    it('returns true when matching PR exists', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(42);
      
      const exists = await hasExistingAutoFixPR(
        mockClient,
        'org',
        'repo',
        'autofix/missing-security-files',
      );

      expect(exists).toBe(true);
    });

    it('returns false when no matching PR exists', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockResolvedValue(null);
      
      const exists = await hasExistingAutoFixPR(
        mockClient,
        'org',
        'repo',
        'autofix/missing-security-files',
      );

      expect(exists).toBe(false);
    });

    it('returns false on error (fail-safe)', async () => {
      const { repos } = await import('github-rest');
      const mockClient = { request: vi.fn() } as unknown as GitHubClient;
      
      vi.mocked(repos.findPRByBranch).mockRejectedValue(new Error('API error'));
      
      const exists = await hasExistingAutoFixPR(
        mockClient,
        'org',
        'repo',
        'autofix/missing-security-files',
      );

      expect(exists).toBe(false);
    });
  });
});
