/**
 * Command: gather-root-readme
 *
 * Purpose:
 *   For each repo in input, fetch the root README.md file (if it exists) from the default branch.
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

export function parseArgs(argv: string[]): Args {
  return {
    ...parseBaseFlags(argv),
    outPath: argv.find(x => x.startsWith('--out='))?.split('=')[1],
  };
}

export async function runCommand(client: any, args: Args) {
  const inputPath = args.input;
  const repoList: string[] = inputPath ? parseRepoInput(inputPath) : [];
  const results: any[] = [];
  for (const repoFull of repoList) {
    const [owner, repo] = repoFull.split('/');
    try {
      // Use existing repos.getReadme which fetches /repos/:owner/:repo/readme
      const readmeResp = await repos.getReadme(client, owner, repo);
      let readme = undefined;
      if (readmeResp && typeof readmeResp === 'object' && 'content' in readmeResp) {
        const encoding = (readmeResp as any).encoding || 'base64';
        readme = Buffer.from((readmeResp as any).content, encoding).toString('utf8');
      }
      results.push({ repo: repoFull, readme });
    } catch (err) {
      // If not found, treat as no README
      results.push({ repo: repoFull, readme: null, error: (err as any)?.message || String(err) });
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

export async function gatherRootReadmeCommand(argv: string[], client?: any) {
  const args = parseArgs(argv);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const c = client ?? createClient(token);
  const res = await runCommand(c as any, args);
  await writeOutput(res, args);
}

export default gatherRootReadmeCommand;
