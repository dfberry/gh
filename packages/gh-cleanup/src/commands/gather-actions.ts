import { permissions } from 'github-rest';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { promises as fs } from 'fs';
import type { GitHubClient } from 'github-rest';
import { readInputRepos } from '../lib/commands-shared.js';
import type { GatherActionsEntry } from '../lib/commands-shared.js';


export type Args = BaseFlags & { input: string; out: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  if (!base.input || !base.out) throw new Error('Missing --input or --out');
  return base as Args;
}

export async function runCommand(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]> {

  const repos = await readInputRepos(args.input);

  const results: GatherActionsEntry[] = [];
  for (const repoFull of repos) {
    const [owner, repo] = repoFull.split('/');
    try {
      const result = await permissions.getRepoActions(client, owner, repo);
      results.push({ owner, repo, details: { actions: result }, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, details: { actions: null }, message, status: 'error' });
    }
  }
  return results;
}

export async function writeOutput(result: any, args: Args):Promise<void> {
  if (args.out) await fs.writeFile(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function actionsCommand(argv: string[], client?: GitHubClient): Promise<GatherActionsEntry[]> {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
  return res;
}
