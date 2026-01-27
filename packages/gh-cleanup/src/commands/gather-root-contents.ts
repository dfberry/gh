/**
 * Command: gather-root-contents
 *
 * Purpose:
 *   For each repo in input, fetch the list of files/folders at the root of the default branch.
 *
 * Usage:
 *   --input=FILE --out=FILE
 */
import * as fs from 'fs/promises';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { repos } from 'github-rest';
import type { GitHubClient } from 'github-rest';
import { readInputRepos } from '../lib/commands-shared.js';
import type { GatherActionsEntry } from '../lib/commands-shared.js';

export function parseArgs(argv: string[]): Args {
  return {
    ...parseBaseFlags(argv),
    outPath: argv.find(x => x.startsWith('--out='))?.split('=')[1],
  };
}

export type Args = BaseFlags & {
  outPath?: string;
};

export async function runCommand(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]> {

  const incomingRepos = await readInputRepos(args?.input);

  const results: any[] = [];
  for (const repoFull of incomingRepos) {
    const [owner, repo] = repoFull.split('/');
    try {
      const branch = await repos.getDefaultBranch(client, owner, repo) || 'main';
      const contents = await repos.getContents(client, owner, repo, '');
      results.push({ repo: repoFull, details: { branch, contents }, contents });
    } catch (err) {
      results.push({ repo: repoFull, details: null, error: (err as any)?.message || String(err) });
    }
  }
  return results;
}

export async function writeOutput(resultObj: any, args: Args): Promise<void> {
  const results = resultObj?.results || [];
  if (args.outPath) {
    await fs.writeFile(args.outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log('Wrote', args.outPath);
  }
}

export async function gatherRootContentsCommand(argv: string[], client?: GitHubClient): Promise<void> {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}

