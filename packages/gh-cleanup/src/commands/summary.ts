import { GitHubClient, pagination, repos } from 'github-rest';
import { categorizeReposWithMetadata } from '../lib/repo-utils.js';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { toMarkdownTable, addGeneratedTimestamp, emitOutput } from '../lib/report.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type Args = { olderThanDays?: number; allowForks?: boolean; verify?: boolean; output?: 'json' | 'md'; out?: string };

export async function summaryCommand(argv: string[]) {
  const args: Args = { olderThanDays: DEFAULT_STALE_DAYS, allowForks: false, verify: false, output: undefined, out: '' };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.allowForks = true;
    if (a === '--verify') args.verify = true;
    if (a.startsWith('--output=')) args.output = (a.split('=')[1] as any) || undefined;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
  }

  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/summary' });

  let me: string;
  try {
    const u = await client.getAuthenticatedUser<{ login: string }>();
    me = (u as any).login;
  } catch (e: any) {
    console.error('Failed to fetch authenticated user:', e?.message ?? e);
    return;
  }

  const all = await pagination.paginateAll(async (page) => repos.listAuthenticatedUserRepos(client, page, 100));

  const forks = all.filter((r) => r.fork && r.owner?.login === me);

  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);
  const staleCandidates = all.filter((r) => {
    if (!args.allowForks && r.fork) return false;
    if (r.archived) return false;
    if (!r.pushed_at) return true;
    const pushed = new Date(r.pushed_at);
    return pushed < cutoff;
  });

  const archivedCandidates = all.filter((r) => {
    if (!args.allowForks && r.fork) return false;
    return Boolean(r.archived);
  });

  let emptyCandidates = all.filter((r) => {
    if (!args.allowForks && r.fork) return false;
    return r.size === 0;
  });
  // Determine truly empty repos by delegating to the REST helper which checks
  // size, commit count, PR count and wiki presence.
  const trulyEmpty = new Set<string>();
  await Promise.all(
    emptyCandidates.map(async (r) => {
      try {
        const empty = await repos.isRepoEmpty(client, r as any);
        if (empty) trulyEmpty.add(r.full_name);
      } catch (err) {
        console.warn(`Failed to check emptiness for ${r.full_name}:`, (err as any)?.message ?? err);
      }
    })
  );
  // compute stale set (verified or heuristic)
  let staleSet = new Set<string>();
  if (args.verify) {
    const meta = await repos.enrichReposMetadata(client, staleCandidates);
    for (const r of staleCandidates) {
      const m = meta[r.full_name];
      if (!m) {
        staleSet.add(r.full_name);
        continue;
      }
      if (!m.lastCommitDate) {
        staleSet.add(r.full_name);
      } else {
        const d = new Date(m.lastCommitDate);
        if (d < cutoff) staleSet.add(r.full_name);
      }
    }
  } else {
    staleSet = new Set(staleCandidates.map((r) => r.full_name));
  }

  const archivedSet = new Set(archivedCandidates.map((r) => r.full_name));

  // determine owned repos (current) and active = owned - (forks, stale, empty)
  const owned = all.filter((r) => r.owner?.login === me);
  const forksOwnedSet = new Set(forks.map((r) => r.full_name));
  const active = owned.filter(
    (r) => !forksOwnedSet.has(r.full_name) && !staleSet.has(r.full_name) && !trulyEmpty.has(r.full_name) && !archivedSet.has(r.full_name)
  );

  if (args.verify) {
    console.log('Summary (verified stale, empty checked by metadata):');
  } else {
    console.log('Summary:');
  }
  console.log(`Forks owned by you: ${forks.length}`);
  console.log(`Stale repos (>${args.olderThanDays} days): ${staleSet.size}`);
  console.log(`Archived repos: ${archivedSet.size}`);
  console.log(`Empty repos (no commits, no PRs, no wiki, size===0): ${trulyEmpty.size}`);
  console.log(`Active/Other repos: ${active.length}`);
  if (active.length > 0) {
    console.log('Active/Other list (first 50):');
    for (const a of active.slice(0, 50)) console.log(`  - ${a.full_name}`);
    if (active.length > 50) console.log(`  ... and ${active.length - 50} more`);
  }
  if (!args.verify) console.log('Note: empty repo check fetched commits/PR counts for size===0 repos only. Use --verify to re-check stale repos.');

  // If requested, emit Active/Other as JSON or Markdown table
  if (args.output) {
    const mapped = await categorizeReposWithMetadata(client, active, { fetch: true });
    if (args.output === 'md') {
      let md = toMarkdownTable(mapped, { title: 'Active Repositories', includeFrontmatter: false });
      md = addGeneratedTimestamp(md, 'Active Repositories');
      await emitOutput(md, args.out);
    } else if (args.output === 'json') {
      const out = JSON.stringify(mapped, null, 2);
      await emitOutput(out, args.out);
    }
  }

}

export default summaryCommand;
