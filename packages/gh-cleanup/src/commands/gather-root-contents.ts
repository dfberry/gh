import { reportError, extractStatus, getDebugConfig, handleApiError } from '../lib/debug.js';
import * as fs from 'fs/promises';
import { createClient } from '../lib/describe-common.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { describeHelpers, getRootContents } from 'github-rest';
import { parseRepoInput } from '../lib/input-parser.js';
/**
 * Command: gather-root-contents
 *
 * Purpose:
 *   For each repo in input, fetch the list of files/folders at the root of the default branch.
 *
 * Usage:
 *   --input=FILE --out=FILE
 */

export function parseArgs(argv: string[]): Args {
  return {
    ...parseBaseFlags(argv),
    outPath: argv.find(x => x.startsWith('--out='))?.split('=')[1],
  };
}
export type Args = BaseFlags & {
  outPath?: string;
};

export async function runCommand(client: any, args: Args) {
  const debugConfig = getDebugConfig(args.debug);
  const inputPath = args.input;
  const repoList: string[] = inputPath ? parseRepoInput(inputPath) : [];
  const results: any[] = [];
  let hasError = false;
  for (const repoFull of repoList) {
    const [owner, repo] = repoFull.split('/');
    const { branch, branchStatus } = await getDefaultBranchWithStatus(owner, repo, debugConfig);
    if (!branch || (branchStatus && branchStatus.code !== 200)) {
      hasError = true;
      results.push({ repo: repoFull, branch, contents: null, status: branchStatus });
      continue;
    }
    const { contents, status } = await getRootContentsWithStatus(client, owner, repo, branch as string, debugConfig);
    if (status && status.error) hasError = true;
    results.push({ repo: repoFull, branch, contents, status });
  }
  return { results, status: hasError ? { code: 207, message: 'partial-error' } : { code: 200, message: 'ok' } };
}

async function getDefaultBranchWithStatus(owner: string, repo: string, debugConfig: any) {
  try {
    const branch = await describeHelpers.getDefaultBranch(owner, repo) || 'main';
    return { branch, branchStatus: { code: 200, message: 'ok' } };
  } catch (err) {
    return { branch: null, branchStatus: extractStatus(err) };
  }
}

async function getRootContentsWithStatus(client: any, owner: string, repo: string, branch: string, debugConfig: any) {
  const { result, status } = await handleApiError(
    () => getRootContents(client, owner, repo, branch),
    debugConfig
  );
  return { contents: result, status };
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
