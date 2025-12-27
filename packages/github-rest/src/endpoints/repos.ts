import type { Repository } from '../types/index.js';
import { GitHubClient } from '../core/client.js';
import { getLastPageFromLink } from '../pagination/links.js';

export async function listAuthenticatedUserRepos(client: GitHubClient, page = 1, per_page = 100): Promise<Repository[]> {
  const q = `?per_page=${per_page}&page=${page}&type=owner`;
  const res = await client.get<Repository[]>(`/user/repos${q}`);
  return res as Repository[];
}

export async function getRepo(client: GitHubClient, owner: string, repo: string): Promise<Repository> {
  return client.get<Repository>(`/repos/${owner}/${repo}`);
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
