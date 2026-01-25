import { repos, user, pagination } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult } from '../lib/github-rest-wrapper.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { promises as fs } from 'fs';
import type { GitHubClient } from 'github-rest';
export type Args = BaseFlags & { out: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  if (!base.out) throw new Error('Missing --out');
  return base as Args;
}

export async function runUserRepos(client: GitHubClient, args: Args) {
  // Fetch authenticated user
  const ures: GitHubRestResult<any> = await wrapGitHubRest(() => user.getAuthenticatedUser(client));
  if (!ures.ok) {
    return { ok: false, error: ures.response ?? ures.original };
  }
  const username = ures.data?.login ?? null;

  // Fetch all repositories for the authenticated user via github-rest helpers
  const rres: GitHubRestResult<any[]> = await wrapGitHubRest(() => pagination.paginateAll((page: number) => repos.listAuthenticatedUserRepos(client, page, 100)));
  if (!rres.ok) {
    return { ok: false, user: username, error: rres.response ?? rres.original };
  }

  const reposList = rres.data ?? [];
  return { ok: true, user: username, total: reposList.length, repos: reposList };
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) await fs.writeFile(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function gatherUserReposCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runUserRepos(client, args);
  await writeOutput(res, args);
  return res;
}
