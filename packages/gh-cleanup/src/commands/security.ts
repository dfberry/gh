
import { GitHubClient, security } from 'github-rest';
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
    try {
      const result = await security.getBranchProtection(client, owner, repo, branchName);
      results.push({ owner, repo, branch: branchName, protection: result, status: 'ok' });
    } catch (err: any) {
      if (err && (err.status === 404 || err.statusCode === 404)) {
        results.push({ owner, repo, branch: branchName, protection: null, message: 'No branch protection enabled', status: 404 });
      } else {
        results.push({ owner, repo, branch: branchName, protection: null, message: err?.message || String(err), status: err?.status || 'error' });
      }
    }
  }
  return results;
}

export async function runCollaborators(client: GitHubClient, args: Args) {
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
    try {
      const result = await security.listCollaborators(client, owner, repo);
      results.push({ owner, repo, collaborators: result, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, collaborators: null, message, status: err?.status || 'error' });
    }
  }
  return results;
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
    try {
      const result = await security.listRepoSecrets(client, owner, repo);
      results.push({ owner, repo, secrets: result, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, secrets: null, message, status: err?.status || 'error' });
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

export async function collaboratorsCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/security' });
  const res = await runCollaborators(client, args);
  await writeOutput(res, args);
  return res;
}

export async function repoSecretsCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/security' });
  const res = await runRepoSecrets(client, args);
  await writeOutput(res, args);
  return res;
}

