import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the github-rest wrapper to execute the callback and return a wrapped result
vi.mock('./github-rest-wrapper.js', () => ({
  default: vi.fn(async (fn: any) => {
    try {
      const data = await fn();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, original: e };
    }
  }),
  GitHubRestResult: undefined,
}));

// Mock github-rest endpoints used by the module
vi.mock('github-rest', () => ({
  user: { getAuthenticatedUser: vi.fn(async () => ({ login: 'me' })) },
  repos: {
    listAuthenticatedUserRepos: vi.fn(async () => ({ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo' })),
    getRepo: vi.fn(async () => ({ full_name: 'owner/repo', default_branch: 'main', private: false, visibility: 'public' })),
    getRepoReadme: vi.fn(async () => 'README'),
    getRepoLanguages: vi.fn(async () => ({ js: 100 })),
  },
  pagination: { paginateAll: vi.fn(async () => [{ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo' }]) },
}));

// Mock the categorizer to return predictable categories
vi.mock('./categorizer.js', () => ({ scoreCategory: vi.fn(async () => ({ category: 'lib', confidence: 0.9 })) }));

import type { GitHubClient } from 'github-rest';
import {
  fetchAuthenticatedUserRepos,
  fetchAuthenticatedUserRepoNames,
  getRepo,
  getDefaultBranch,
  getRepoReadme,
  getRepoLanguages,
  paginateUserRepos,
  categorizeReposWithMetadata,
} from './github-repos.js';

describe('github-repos helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchAuthenticatedUserRepos returns user and repos', async () => {
    const res = await fetchAuthenticatedUserRepos({} as GitHubClient);
    expect(res.ok).toBe(true);
    expect(res.user).toBe('me');
    expect(Array.isArray(res.repos)).toBe(true);
    expect(res.repos?.[0].full_name).toBe('owner/repo');
  });

  it('fetchAuthenticatedUserRepoNames returns normalized names', async () => {
    const names = await fetchAuthenticatedUserRepoNames({} as GitHubClient);
    expect(names).toEqual(['owner/repo']);
  });

  it('getRepo returns repo object', async () => {
    const r = await getRepo({} as GitHubClient, 'owner', 'repo');
    expect(r).toBeTruthy();
    expect(r.full_name).toBe('owner/repo');
  });

  it('getDefaultBranch returns default branch', async () => {
    const b = await getDefaultBranch({} as GitHubClient, 'owner', 'repo');
    expect(b).toBe('main');
  });

  it('getRepoReadme returns readme', async () => {
    const md = await getRepoReadme({} as GitHubClient, 'owner', 'repo');
    expect(md).toBe('README');
  });

  it('getRepoLanguages returns language map', async () => {
    const langs = await getRepoLanguages({} as GitHubClient, 'owner', 'repo');
    expect(langs).toEqual({ js: 100 });
  });

  it('paginateUserRepos returns array of repos', async () => {
    const list = await paginateUserRepos({} as GitHubClient);
    expect(Array.isArray(list)).toBe(true);
    expect(list?.[0].full_name).toBe('owner/repo');
  });

  it('categorizeReposWithMetadata returns categorized items', async () => {
    const input = [{ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo' }];
    const res = await categorizeReposWithMetadata({} as GitHubClient, input, { fetch: true });
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].category).toBe('lib');
    expect(res[0].full_name).toBe('owner/repo');
  });
});
