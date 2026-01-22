import { GitHubClient, security } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult} from '../lib/github-rest-wrapper.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

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
    if (r.ok) {
      results.push({ owner, repo, branch: branchName, protection: r.data, status: 'ok' });
    } else {
      const resp = r.response;
      if (r.status === 404 || resp?.status === 404) {
        results.push({ owner, repo, branch: branchName, protection: null, message: 'No branch protection enabled', status: 404 });
      } else {
        results.push({ owner, repo, branch: branchName, protection: null, message: resp?.details || String(resp), status: resp?.status || 'error' });
      }
    }
  }
  return results;
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function branchProtectionCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/security' });
  const res = await runBranchProtection(client, args);
  await writeOutput(res, args);
  return res;
}
