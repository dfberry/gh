export function parseArgs(argv: string[]): Args {
  return {
    ...parseBaseFlags(argv),
    outPath: argv.find(x => x.startsWith('--out='))?.split('=')[1],
  };
}
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
import { createClient } from '../lib/describe-common.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { repos } from 'github-rest';
import { parseRepoInput } from '../lib/input-parser.js';

export type Args = BaseFlags & {
  outPath?: string;
};

export async function runCommand(client: any, args: Args) {
  const inputPath = args.input;
  const repoList: string[] = inputPath ? parseRepoInput(inputPath) : [];
  const results: any[] = [];
  for (const repoFull of repoList) {
    const [owner, repo] = repoFull.split('/');
    try {
      const branch = await repos.getDefaultBranch(client, owner, repo) || 'main';
      const contents = await repos.getContents(client, owner, repo, '');
      results.push({ repo: repoFull, branch, contents });
    } catch (err) {
      results.push({ repo: repoFull, error: (err as any)?.message || String(err) });
    }
  }
  return { results };
}

export async function writeOutput(resultObj: any, args: Args) {
  const results = resultObj?.results || [];
  if (args.outPath) {
    await fs.writeFile(args.outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log('Wrote', args.outPath);
  }
}

export async function gatherRootContentsCommand(argv: string[]) {
  const args = parseArgs(argv);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const client = createClient(token);
  const res = await runCommand(client as any, args);
  await writeOutput(res, args);
}

export default gatherRootContentsCommand;
