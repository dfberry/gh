import { permissions } from 'github-rest';
import { promises as fs } from 'fs';
import type { GitHubClient } from 'github-rest';
import type { GatherActionsEntry } from '../lib/commands-shared.js';
import type { Params } from '../commandgroups/base.js';

export async function runCommand(client: GitHubClient, repos: string[]): Promise<GatherActionsEntry[]> {

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

export async function writeOutput(result: any, args: any):Promise<void> {
  if (args.out) await fs.writeFile(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function actionsCommand(params: Params, client?: GitHubClient): Promise<GatherActionsEntry[]> {
  if (!client) throw new Error('GitHub client is required');
  if (!params?.data?.repos) throw new Error('No repositories provided');
  const res = await runCommand(client, params?.data?.repos);
  await writeOutput(res, params.args);
  return res;
}
