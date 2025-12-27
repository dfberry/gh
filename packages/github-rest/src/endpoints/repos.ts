import type { Repository } from '../types/index.js';
import { GitHubClient } from '../core/client.js';
import { getLastPageFromLink } from '../pagination/links.js';
import { paginateAll } from '../pagination/index.js';

export async function listAuthenticatedUserRepos(client: GitHubClient, page = 1, per_page = 100): Promise<Repository[]> {
  const q = `?per_page=${per_page}&page=${page}&type=owner`;
  const res = await client.get<Repository[]>(`/user/repos${q}`);
  return res as Repository[];
}

export async function getRepo(client: GitHubClient, owner: string, repo: string): Promise<Repository> {
  return client.get<Repository>(`/repos/${owner}/${repo}`);
}

/**
 * Fetch languages for a repository. Returns `null` on error.
 */
export async function getRepoLanguages(client: GitHubClient, owner: string, repo: string): Promise<Record<string, number> | null> {
  try {
    return await client.get<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
  } catch (err) {
    return null;
  }
}

/**
 * Fetch and decode the repository README. Returns decoded string or `null` if not available.
 */
export async function getRepoReadme(client: GitHubClient, owner: string, repo: string): Promise<string | null> {
  try {
    const rd = await client.get<any>(`/repos/${owner}/${repo}/readme`);
    if (!rd || !rd.content) return null;
    const buff = Buffer.from(rd.content, rd.encoding ?? 'base64');
    return buff.toString('utf8');
  } catch (err) {
    return null;
  }
}

export async function deleteRepo(client: GitHubClient, owner: string, repo: string, opts?: { dryRun?: boolean }): Promise<boolean> {
  if (opts?.dryRun ?? true) {
    return false;
  }
  await client.del(`/repos/${owner}/${repo}`);
  return true;
}

export async function patchRepo(client: GitHubClient, owner: string, repo: string, body: Partial<Record<string, unknown>>): Promise<any> {
  return client.patch(`/repos/${owner}/${repo}`, body);
}

export async function archiveRepo(client: GitHubClient, owner: string, repo: string, opts?: { dryRun?: boolean }): Promise<boolean> {
  if (opts?.dryRun ?? true) return false;
  await patchRepo(client, owner, repo, { archived: true });
  return true;
}

export type RepoMetadata = {
  commits: number;
  pulls: number;
  hasCommits: boolean;
  lastCommitDate?: string | null;
};

export type FilterOptions = {
  archived?: boolean;
  fork?: boolean;
  template?: boolean;
  visibility?: 'public' | 'private' | 'all';
  minSize?: number;
  maxSize?: number;
  minPRs?: number;
  maxPRs?: number;
  minCommits?: number;
  maxCommits?: number;
  updatedBefore?: Date;
  updatedAfter?: Date;
};

async function getCountFromEndpoint(client: GitHubClient, path: string): Promise<number> {
  try {
    const res = await client.rawRequest<any[]>('GET', `${path}&per_page=1`);
    const link = res.headers['link'] ?? res.headers['Link'];
    if (link) {
      const last = getLastPageFromLink(link);
      if (typeof last === 'number') return last;
    }
    const items = res.body as any[];
    return items?.length ?? 0;
  } catch (err: any) {
    if (err?.status === 409) return 0; // empty repo
    throw err;
  }
}

export async function getCommitsCount(client: GitHubClient, owner: string, repo: string): Promise<number> {
  return getCountFromEndpoint(client, `/repos/${owner}/${repo}/commits?`);
}

export async function getPullsCount(client: GitHubClient, owner: string, repo: string): Promise<number> {
  return getCountFromEndpoint(client, `/repos/${owner}/${repo}/pulls?state=all`);
}

export async function fetchRepoMetadata(client: GitHubClient, owner: string, repo: string): Promise<RepoMetadata> {
  try {
    const commitsRes = await client.rawRequest<any[]>('GET', `/repos/${owner}/${repo}/commits?per_page=1`);
    const commitsLink = commitsRes.headers['link'] ?? commitsRes.headers['Link'];
    const commits = commitsLink ? (getLastPageFromLink(commitsLink) ?? commitsRes.body.length) : commitsRes.body.length;
    const lastCommitDate = commitsRes.body && commitsRes.body.length > 0 ? commitsRes.body[0]?.commit?.committer?.date ?? null : null;
    const pullsRes = await client.rawRequest<any[]>('GET', `/repos/${owner}/${repo}/pulls?state=all&per_page=1`);
    const pullsLink = pullsRes.headers['link'] ?? pullsRes.headers['Link'];
    const pulls = pullsLink ? (getLastPageFromLink(pullsLink) ?? pullsRes.body.length) : pullsRes.body.length;
    return { commits, pulls, hasCommits: commits > 0, lastCommitDate };
  } catch (err: any) {
    if (err?.status === 409) return { commits: 0, pulls: 0, hasCommits: false, lastCommitDate: null };
    throw err;
  }
}

/**
 * Return the best-effort "last updated" timestamp for a repository.
 * Prefers the date of the last commit (from commits API) and falls back
 * to the repository `pushed_at` value.
 */
export async function getRepoLastUpdated(client: GitHubClient, owner: string, repo: string): Promise<string | null> {
  try {
    const meta = await fetchRepoMetadata(client, owner, repo);
    if (meta.lastCommitDate) return meta.lastCommitDate;
    const r = await getRepo(client, owner, repo);
    return r.pushed_at ?? null;
  } catch (err: any) {
    return null;
  }
}

/**
 * Determine whether a repository should be considered stale relative to the
 * provided cutoff date. Prefers last commit date, falls back to `pushed_at`,
 * and treats repositories with no recorded activity as stale.
 */
export async function isStale(client: GitHubClient, repo: Repository, cutoff: Date): Promise<boolean> {
  try {
    const meta = await fetchRepoMetadata(client, repo.owner.login, repo.name);
    if (meta.lastCommitDate) {
      return new Date(meta.lastCommitDate) < cutoff;
    }
    if (repo.pushed_at) {
      return new Date(repo.pushed_at) < cutoff;
    }
    // No activity recorded -> consider stale
    return true;
  } catch (err: any) {
    // If repository is empty (409) treat as stale; otherwise rethrow
    if (err?.status === 409) return true;
    throw err;
  }
}

/**
 * Lightweight eligibility check for stale processing.
 * Returns `false` for repos that should be skipped by default (archived),
 * and optionally skips forks when `opts.excludeForks` is true.
 */
export function repoIsEligibleForStale(repo: Repository, opts: { excludeForks?: boolean } = { excludeForks: true }): boolean {
  if (repo.archived) return false;
  if (opts.excludeForks && repo.fork) return false;
  return true;
}

export function repoMatchesFilters(repo: Repository, meta: RepoMetadata | undefined, f?: FilterOptions): boolean {
  if (!f) return true;
  if (f.archived !== undefined && repo.archived !== f.archived) return false;
  if (f.fork !== undefined && repo.fork !== f.fork) return false;
  if (f.template !== undefined && (repo.template ?? false) !== f.template) return false;
  if (f.visibility && f.visibility !== 'all') {
    const isPrivate = repo.private ?? false;
    if (f.visibility === 'public' && isPrivate) return false;
    if (f.visibility === 'private' && !isPrivate) return false;
  }
  if (f.minSize !== undefined && repo.size < f.minSize) return false;
  if (f.maxSize !== undefined && repo.size > f.maxSize) return false;
  if (meta) {
    if (f.minPRs !== undefined && meta.pulls < f.minPRs) return false;
    if (f.maxPRs !== undefined && meta.pulls > f.maxPRs) return false;
    if (f.minCommits !== undefined && meta.commits < f.minCommits) return false;
    if (f.maxCommits !== undefined && meta.commits > f.maxCommits) return false;
    if (f.updatedBefore || f.updatedAfter) {
      const pushed = repo.pushed_at ? new Date(repo.pushed_at) : null;
      if (pushed) {
        if (f.updatedBefore && pushed >= f.updatedBefore) return false;
        if (f.updatedAfter && pushed <= f.updatedAfter) return false;
      }
    }
  }
  return true;
}

export async function enrichReposMetadata(client: GitHubClient, repos: Repository[]): Promise<Record<string, RepoMetadata>> {
  const out: Record<string, RepoMetadata> = {};
  for (const r of repos) {
    const [owner, name] = r.full_name.split('/');
    try {
      out[r.full_name] = await fetchRepoMetadata(client, owner, name);
    } catch (err) {
      out[r.full_name] = { commits: 0, pulls: 0, hasCommits: false, lastCommitDate: null };
    }
  }
  return out;
}

export type FindEmptyOptions = { excludeForks?: boolean; verify?: boolean; maxPages?: number };

/**
 * Find repositories owned by the authenticated user that are likely empty.
 * - Applies cheap filters (archived, forks, size===0)
 * - If `verify` is true, calls `isRepoEmpty` to confirm emptiness (slower)
 */
export async function findEmptyRepos(client: GitHubClient, opts: FindEmptyOptions = {}): Promise<Repository[]> {
  const all = await paginateAll<Repository>((page) => listAuthenticatedUserRepos(client, page, 100), { maxPages: opts.maxPages });
  const candidates = all.filter((r) => {
    if (r.archived) return false;
    if (opts.excludeForks && r.fork) return false;
    return r.size === 0;
  });
  if (!opts.verify) return candidates;

  const out: Repository[] = [];
  for (const r of candidates) {
    try {
      const empty = await isRepoEmpty(client, r as any);
      if (empty) out.push(r);
    } catch (err) {
      // log a warning and skip on errors
      // Avoid importing console/logging utilities from caller packages
      // Caller can choose to re-check if needed.
    }
  }
  return out;
}

/**
 * Determine whether the given repository should be considered "empty".
 * Criteria:
 * - repo.size === 0
 * - no commits
 * - no pull requests
 * - no wiki (if detectable)
 */
export async function isRepoEmpty(client: GitHubClient, repo: Repository): Promise<boolean> {
  if (repo.archived) return false;
  if (repo.size !== 0) return false;

  try {
    const meta = await fetchRepoMetadata(client, repo.owner.login, repo.name);
    if ((meta?.commits ?? 0) > 0) return false;
    if ((meta?.pulls ?? 0) > 0) return false;
  } catch (err: any) {
    // If the repository is empty we may get a 409 from the commits API; treat as empty
    if (err?.status === 409) return true;
    throw err;
  }

  const anyRepo = repo as any;
  if (anyRepo.has_wiki === true || anyRepo.hasWiki === true) return false;

  try {
    const full = await getRepo(client, repo.owner.login, repo.name);
    if ((full as any).has_wiki === true || (full as any).hasWiki === true) return false;
  } catch (e) {
    // ignore errors fetching full repo metadata
  }

  return true;
}
