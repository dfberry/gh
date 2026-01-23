import { GitHubClient, security } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult } from '../lib/github-rest-wrapper.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

export type Args = BaseFlags & { input: string; out: string; branch?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  if (!base.input || !base.out) throw new Error('Missing --input or --out');
  return base as Args;
}

export async function runRepoSecrets(client: GitHubClient, args: Args) {
  const raw = fs.readFileSync(args.input, 'utf8');
  let repos: string[] = [];
  try {
    repos = JSON.parse(raw);
  } catch {
    repos = raw.split('\n').map(x => x.trim()).filter(Boolean);
  }
  const results = [];
  for (const repoFull of repos) {
    const [owner, repo] = repoFull.split('/');
    const r: GitHubRestResult<Awaited<ReturnType<typeof security.listRepoSecrets>>> =
      await wrapGitHubRest(() => security.listRepoSecrets(client, owner, repo));
    const resp = r.response;
    results.push({
      owner,
      repo,
      secrets: r.data || null,
      message: resp?.details || String(resp) || 'no_message_found',
      status: resp?.status || 'status_not_found',
    });
  }
  return results;
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function repoSecretsCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runRepoSecrets(client, args);
  await writeOutput(res, args);
  return res;
}
