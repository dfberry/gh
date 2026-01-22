import { GitHubClient, security } from 'github-rest';
import wrapGitHubRest from '../lib/github-rest-wrapper.js';
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
    const r = await wrapGitHubRest(() => security.listRepoSecrets(client, owner, repo));
    if (r.ok) {
      results.push({ owner, repo, secrets: r.data, status: 'ok' });
    } else {
      let message = r.response?.message || String(r.response);
      if (r.status === 403 || r.response?.status === 403) {
        let apiMsg = '';
        const details = r.response?.details as any;
        if (details && details.message) apiMsg = details.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, secrets: null, message, status: r.status || 'error' });
    }
  }
  return results;
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

export async function repoSecretsCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/security' });
  const res = await runRepoSecrets(client, args);
  await writeOutput(res, args);
  return res;
}
