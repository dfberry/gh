import { GitHubClient, pagination, repos } from 'github-rest';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { toMarkdownTable } from '../lib/report.js';
import * as fs from 'node:fs/promises';

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

  // For the empty repos we consider them truly empty only if they have no commits,
  // no pull requests, and no wiki (kb). We'll fetch metadata for the size===0 set
  // (this is usually small) to determine the accurate empty count.
  const emptyMeta = await repos.enrichReposMetadata(client, emptyCandidates);
  const trulyEmpty = new Set<string>();
  for (const r of emptyCandidates) {
    const m = emptyMeta[r.full_name];
    const hasCommits = !!m && m.hasCommits;
    const pulls = m?.pulls ?? 0;
    const hasWiki = Boolean((r as any).has_wiki || (r as any).hasWiki);
    if (!hasCommits && pulls === 0 && !hasWiki) trulyEmpty.add(r.full_name);
  }
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
  console.log(`Empty repos (no commits, no PRs, no wiki): ${trulyEmpty.size}`);
  console.log(`Active/Other repos: ${active.length}`);
  if (active.length > 0) {
    console.log('Active/Other list (first 50):');
    for (const a of active.slice(0, 50)) console.log(`  - ${a.full_name}`);
    if (active.length > 50) console.log(`  ... and ${active.length - 50} more`);
  }
  if (!args.verify) console.log('Note: empty repo check fetched commits/PR counts for size===0 repos only. Use --verify to re-check stale repos.');

  // If requested, emit Active/Other as JSON or Markdown table
  if (args.output) {
    const mapped = active.map((r) => ({
      full_name: (r as any).full_name,
      html_url: (r as any).html_url,
      description: (r as any).description ?? null,
      language: (r as any).language ?? null,
      topics: (r as any).topics ?? [],
      category: 'active',
      confidence: 1,
      last_updated: (r as any).pushed_at ?? null,
      stars: (r as any).stargazers_count ?? null,
    }));

    if (args.output === 'md') {
      const md = toMarkdownTable(mapped, { title: 'Active Repositories', includeFrontmatter: false });
      if (args.out) await fs.writeFile(args.out, md, 'utf8');
      else console.log(md);
    } else if (args.output === 'json') {
      const out = JSON.stringify(mapped, null, 2);
      if (args.out) await fs.writeFile(args.out, out, 'utf8');
      else console.log(out);
    }
  }
}

export default summaryCommand;
