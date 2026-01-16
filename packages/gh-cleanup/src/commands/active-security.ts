import * as fs from 'fs/promises';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { createGitHubClient, security, repos, pagination } from 'github-rest';
import { formatJsonOutput, emitOutput } from '../lib/report.js';
import { RepoInputPolicy, resolveReposWithPolicy } from '../lib/repo-utils.js';

export type Args = BaseFlags & { repos?: string[]; inputOnly?: boolean };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const cfg: Args = { ...base, repos: [] } as any;
  for (const a of argv) {
    if (a.startsWith('--repos=')) cfg.repos = (a.split('=')[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (a === '--input-only') cfg.inputOnly = true;
  }
  return cfg;
}

export async function runCommand(client: any, args: Args) {
  // Resolve repositories according to the caller's policy. When
  // `inputOnly` is set, we disallow falling back to listing authenticated
  // user repos and require an explicit `--input=`.
  const policy: RepoInputPolicy = { allowUserFallback: !args.inputOnly };
  const resolved = await resolveReposWithPolicy(client, (args as any).input, policy);
  if (resolved === undefined) {
    throw new Error('No input provided and policy disallows listing user repos; provide --input=path');
  }
  let entries: string[] = [];
  if (Array.isArray(resolved) && resolved.length > 0) entries = resolved.map((r: any) => (typeof r === 'string' ? r : r.full_name || `${r.owner}/${r.name}`));
  else if (args.repos && args.repos.length > 0) entries = args.repos;

  const results: any[] = [];
  for (const r of entries) {
    const parts = r.split('/');
    if (parts.length < 2) continue;
    const owner = parts[0];
    const repo = parts[1];
    try {
      const cfg = await security.getRepoSecurityConfig(client, owner, repo);
      results.push({ owner, repo, config: cfg });
    } catch (err) {
      results.push({ owner, repo, error: (err as any)?.message || String(err) });
    }
  }
  return { results };
}

export async function activeSecurityCommand(argv: string[]) {
  const args = parseArgs(argv);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const client = createGitHubClient({ token: token as string | undefined });
  const res = await runCommand(client as any, args);
  const out = args.out || undefined;
  await emitOutput(formatJsonOutput(res.results), out);
}

export default activeSecurityCommand;
