import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { promises as fs } from 'fs';
import type { GitHubClient } from 'github-rest';
import { fetchAuthenticatedUserRepos } from '../lib/github-repos.js';
export type Args = BaseFlags & { out: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  if (!base.out) throw new Error('Missing --out');
  return base as Args;
}

export async function runUserRepos(client: GitHubClient, args: Args) {
  const res = await fetchAuthenticatedUserRepos(client);
  return res;
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
