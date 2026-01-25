import { repos, user, pagination } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult } from '../lib/github-rest-wrapper.js';
import type { GitHubClient } from 'github-rest';
import { Categorized } from './report.js';
import { scoreCategory } from './categorizer.js';

export type FetchUserReposResult = {
  ok: boolean;
  user?: string | null;
  total?: number;
  repos?: Array<any>;
  error?: any;
};

export async function fetchAuthenticatedUserRepos(client: GitHubClient): Promise<FetchUserReposResult> {
  if (!client) return { ok: false, error: 'GitHub client is required' };

  const ures: GitHubRestResult<any> = await wrapGitHubRest(() => user.getAuthenticatedUser(client));
  if (!ures.ok) {
    return { ok: false, error: ures.response ?? ures.original };
  }
  const username = ures.data?.login ?? null;

  const rres: GitHubRestResult<any[]> = await wrapGitHubRest(() =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pagination.paginateAll((page: number) => repos.listAuthenticatedUserRepos(client, page, 100)),
  );
  if (!rres.ok) {
    return { ok: false, user: username, error: rres.response ?? rres.original };
  }

  const reposList = rres.data ?? [];
  return { ok: true, user: username, total: reposList.length, repos: reposList };
}

export async function fetchAuthenticatedUserRepoNames(client: GitHubClient): Promise<string[]> {
  const res = await fetchAuthenticatedUserRepos(client);
  if (!res.ok) return [];
  const repoObjs = res.repos || [];
  const names: string[] = [];
  for (const r of repoObjs) {
    if (r.full_name) names.push(r.full_name);
    else if (r.owner && r.name) names.push(`${r.owner.login || r.owner}/${r.name}`);
  }
  return names;
}

export async function getRepo(client: GitHubClient, owner: string, repoName: string): Promise<any | null> {
  if (!client) return null;
  const res = await wrapGitHubRest(() => repos.getRepo(client, owner, repoName));
  if (!res.ok) return null;
  return res.data ?? null;
}

export async function getDefaultBranch(client: GitHubClient, owner: string, repoName: string): Promise<string | null> {
  const r = await getRepo(client, owner, repoName);
  if (!r) return null;
  return r.default_branch || null;
}

export async function getRepoReadme(client: GitHubClient, owner: string, repoName: string): Promise<any | null> {
  if (!client) return null;
  const res = await wrapGitHubRest(() => repos.getRepoReadme(client, owner, repoName));
  if (!res.ok) return null;
  return res.data ?? null;
}

export async function getRepoLanguages(client: GitHubClient, owner: string, repoName: string): Promise<Record<string, number> | null> {
  if (!client) return null;
  const res = await wrapGitHubRest(() => repos.getRepoLanguages(client, owner, repoName));
  if (!res.ok) return null;
  return res.data ?? null;
}

export async function paginateUserRepos(client: GitHubClient): Promise<any[] | null> {
  if (!client) return null;
  const rres: GitHubRestResult<any[]> = await wrapGitHubRest(() =>
    // @ts-ignore
    pagination.paginateAll((page: number) => repos.listAuthenticatedUserRepos(client, page, 100)),
  );
  if (!rres.ok) return null;
  return rres.data ?? [];
}

const exported = {
  fetchAuthenticatedUserRepos,
  getRepo,
  getDefaultBranch,
  getRepoReadme,
  getRepoLanguages,
  paginateUserRepos,
};

export default exported;

export async function categorizeReposWithMetadata(client: GitHubClient, repos: any[], opts: { fetch?: boolean; providedRules?: any[] } = {}): Promise<Categorized[]> {
  const results: Categorized[] = [];
  for (const r of repos) {
    let languages: Record<string, number> | null = null;
    let readmeText: string | null = null;
    let ghRepo: any = null;
    try {
      if (opts.fetch) {
        languages = await getRepoLanguages(client, r.owner.login, r.name);
        readmeText = await getRepoReadme(client, r.owner.login, r.name);
        try {
          ghRepo = await getRepo(client, r.owner.login, r.name);
        } catch (e) {
          ghRepo = null;
        }
      }
    } catch (e) {
      languages = null;
      readmeText = null;
    }

    const { category, confidence } = await scoreCategory(r, languages, readmeText, (r as any).topics, opts.providedRules);
    results.push({
      full_name: r.full_name,
      html_url: r.html_url,
      description: (r as any).description ?? null,
      language: r.language ?? null,
      topics: (r as any).topics,
      category,
      confidence,
      last_updated: r.pushed_at ?? null,
      stars: (r as any).stargazers_count ?? null,
      archived: (r as any).archived ?? false,
      fork: (r as any).fork ?? false,
      template: (r as any).template ?? (r as any).has_template ?? false,
      private: (ghRepo && typeof ghRepo.private !== 'undefined') ? ghRepo.private : (r as any).private ?? false,
      visibility: (ghRepo && typeof ghRepo.visibility !== 'undefined') ? ghRepo.visibility : (r as any).visibility ?? ((r as any).private ? 'private' : 'public'),
    });
  }
  return results;
}
