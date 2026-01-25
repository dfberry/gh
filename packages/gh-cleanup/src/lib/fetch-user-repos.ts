import { repos, user, pagination } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult } from '../lib/github-rest-wrapper.js';
import type { GitHubClient } from 'github-rest';

export type FetchUserReposResult = {
  ok: boolean;
  user?: string | null;
  total?: number;
  repos?: Array<any>;
  error?: any;
};

export async function fetchAuthenticatedUserRepos(client: GitHubClient): Promise<FetchUserReposResult> {
  if (!client) return { ok: false, error: 'GitHub client is required' };

  // Fetch authenticated user
  const ures: GitHubRestResult<any> = await wrapGitHubRest(() => user.getAuthenticatedUser(client));
  if (!ures.ok) {
    return { ok: false, error: ures.response ?? ures.original };
  }
  const username = ures.data?.login ?? null;

  // Fetch all repositories for the authenticated user via github-rest helpers
  const rres: GitHubRestResult<any[]> = await wrapGitHubRest(() =>
    // use paginateAll helper provided by github-rest bindings
    // page args handled by paginateAll helper
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

export default fetchAuthenticatedUserRepos;
