import { GitHubClient, security } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult} from '../lib/github-rest-wrapper.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import * as fs from 'fs';


/********************************
 * 
 * curl -i -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/OWNER/REPO/branches/BRANCH/protection"
 * 
 */

  // curl -i -H "Authorization: token $GH_TOKEN" \
  // -H "Accept: application/vnd.github+json" \
  // "https://api.github.com/repos/dfberry/gh/branches/main/protection"

  // curl -i -H "Authorization: token $GH_TOKEN" \
  // -H "Accept: application/vnd.github+json" \
  // "https://api.github.com/repos/Azure-Samples/azure-sdk-for-js-docs/branches/main/protection"

export type Args = BaseFlags & { input: string; out: string; branch?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  if (!base.input || !base.out) throw new Error('Missing --input or --out');
  return base as Args;
}

export async function runBranchProtection(client: GitHubClient, args: Args) {
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
    let branchName = args.branch;
    if (!branchName) {
      results.push({ owner, repo, branch: null, protection: null, message: 'No branch specified', status: 'skipped' });
      continue;
    }
    const r: GitHubRestResult<Awaited<ReturnType<typeof security.getBranchProtection>>> = await wrapGitHubRest(() => security.getBranchProtection(client, owner, repo, branchName));

    const resp = r.response;
    results.push({ owner, repo, branch: branchName, protection: r.data || null, message: resp?.details || String(resp) || "no_message_found", status: resp?.status || 'status_not_found' });

  }
  return results;
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function branchProtectionCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runBranchProtection(client, args);
  await writeOutput(res, args);
  return res;
}
