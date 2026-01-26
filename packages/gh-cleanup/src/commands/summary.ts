/* DEPRECATED: made redundant by other commands */
import type { GitHubClient } from 'github-rest';
import { pagination, repos } from 'github-rest';
import { categorizeReposWithMetadata } from '../lib/github-repos.js';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { toMarkdownTable, addGeneratedTimestamp, emitOutput, formatJsonOutput } from '../lib/report.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

export type Args = BaseFlags & { olderThanDays?: number; allowForks?: boolean; verify?: boolean; output?: 'json' | 'md'; summaryOut?: string; out?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, olderThanDays: DEFAULT_STALE_DAYS, allowForks: false, verify: false, output: undefined, out: '' };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.allowForks = true;
    if (a === '--verify') args.verify = true;
    if (a.startsWith('--output=')) args.output = (a.split('=')[1] as any) || undefined;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a.startsWith('--summary-out=')) args.summaryOut = a.split('=')[1];
  }
  return args;
}

export async function runCommand(client: GitHubClient, args: Args): Promise<any> {
  let me: string;
  try {
    const u = await client.getAuthenticatedUser();
    me = (u as any).login;
  } catch (e: any) {
    console.error('Failed to fetch authenticated user:', e?.message ?? e);
    return null;
  }

  const all = await pagination.paginateAll(async (page: number) => repos.listAuthenticatedUserRepos(client, page, 100));

  const forks = all.filter((r: any) => r.fork && r.owner?.login === me);

  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);
  const staleCandidates = all.filter((r: any) => {
    if (!args.allowForks && r.fork) return false;
    if (r.archived) return false;
    if (!r.pushed_at) return true;
    const pushed = new Date(r.pushed_at);
    return pushed < cutoff;
  });

  const archivedCandidates = all.filter((r: any) => {
    if (!args.allowForks && r.fork) return false;
    return Boolean(r.archived);
  });

  let emptyCandidates = all.filter((r: any) => {
    if (!args.allowForks && r.fork) return false;
    return r.size === 0;
  });
  const trulyEmpty = new Set<string>();
  await Promise.all(
    emptyCandidates.map(async (r: any) => {
      try {
        const empty = await repos.isRepoEmpty(client, r as any);
        if (empty) trulyEmpty.add(r.full_name);
      } catch (err) {
        console.warn(`Failed to check emptiness for ${r.full_name}:`, (err as any)?.message ?? err);
      }
    })
  );

  let staleSet = new Set<string>();
  let staleList: any[] = [];
  if (args.verify) {
    const meta = await repos.enrichReposMetadata(client, staleCandidates as any[]);
    for (const r of staleCandidates) {
      const m = meta[r.full_name];
      let isStale = false;
      if (!m) {
        isStale = true;
      } else if (!m.lastCommitDate) {
        isStale = true;
      } else {
        const d = new Date(m.lastCommitDate);
        if (d < cutoff) isStale = true;
      }
      if (isStale) {
        staleSet.add(r.full_name);
        staleList.push(r);
      }
    }
  } else {
    staleList = staleCandidates;
    staleSet = new Set(staleCandidates.map((r: any) => r.full_name));
  }

  const archivedSet = new Set(archivedCandidates.map((r: any) => r.full_name));

  const owned = all.filter((r: any) => r.owner?.login === me);
  const forksOwnedSet = new Set(forks.map((r: any) => r.full_name));
  const active = owned.filter((r: any) => !forksOwnedSet.has(r.full_name) && !staleSet.has(r.full_name) && !trulyEmpty.has(r.full_name) && !archivedSet.has(r.full_name));

  const privateCount = owned.filter((r: any) => Boolean(r.private)).length;
  const publicCount = owned.length - privateCount;
  const activePrivateCount = active.filter((r: any) => Boolean(r.private)).length;
  const activePublicCount = active.length - activePrivateCount;
  const forksPrivateCount = forks.filter((r: any) => Boolean(r.private)).length;
  const forksPublicCount = forks.length - forksPrivateCount;
  const stalePrivateCount = staleList.filter((r: any) => Boolean(r.private)).length;
  const stalePublicCount = staleList.length - stalePrivateCount;
  const archivedPrivateCount = archivedCandidates.filter((r: any) => Boolean(r.private)).length;
  const archivedPublicCount = archivedCandidates.length - archivedPrivateCount;
  const emptyList = emptyCandidates.filter((r: any) => trulyEmpty.has(r.full_name));
  const emptyPrivateCount = emptyList.filter((r: any) => Boolean(r.private)).length;
  const emptyPublicCount = emptyList.length - emptyPrivateCount;

  if (args.verify) {
    console.log('Summary (verified stale, empty checked by metadata):');
  } else {
    console.log('Summary:');
  }
  console.log(`Public repos: ${publicCount}`);
  console.log(`Private repos: ${privateCount}`);
  console.log(`Forks owned by you: ${forks.length} (public: ${forksPublicCount}, private: ${forksPrivateCount})`);
  console.log(`Stale repos (>${args.olderThanDays} days): ${staleSet.size} (public: ${stalePublicCount}, private: ${stalePrivateCount})`);
  console.log(`Archived repos: ${archivedSet.size} (public: ${archivedPublicCount}, private: ${archivedPrivateCount})`);
  console.log(`Empty repos (no commits, no PRs, no wiki, size===0): ${trulyEmpty.size} (public: ${emptyPublicCount}, private: ${emptyPrivateCount})`);
  console.log(`Active/Other repos: ${active.length} (public: ${activePublicCount}, private: ${activePrivateCount})`);
  if (active.length > 0) {
    console.log('Active/Other list (first 50):');
    for (const a of active.slice(0, 50)) console.log(`  - ${a.full_name}`);
    if (active.length > 50) console.log(`  ... and ${active.length - 50} more`);
  }
  if (!args.verify) console.log('Note: empty repo check fetched commits/PR counts for size===0 repos only. Use --verify to re-check stale repos.');

  return {
    all,
    owned,
    forks,
    active,
    trulyEmpty: Array.from(trulyEmpty),
    staleList,
    archivedCandidates,
    counts: {
      publicCount,
      privateCount,
      forksPublicCount,
      forksPrivateCount,
      stalePublicCount,
      stalePrivateCount,
      archivedPublicCount,
      archivedPrivateCount,
      emptyPublicCount,
      emptyPrivateCount,
      activePublicCount,
      activePrivateCount,
    },
  };
}

export async function writeOutput(result: any, args: Args, client: any) {
  if (!result) return;
  const { active } = result;
  if (!client) throw new Error('GitHub client is required');
  if (args.output) {
    const mapped = await categorizeReposWithMetadata(client, active, { fetch: true });
    if (args.output === 'md') {
      let md = toMarkdownTable(mapped, { title: 'Active Repositories', includeFrontmatter: false });
      md = addGeneratedTimestamp(md, 'Active Repositories');
      await emitOutput(md, args.out || 'summary.md');
    } else if (args.output === 'json') {
      await emitOutput(formatJsonOutput(mapped), args.out || 'summary.json');
    }
  }

  if (args.summaryOut) {
    const header = `# Repository Summary\n\n`;
    const c = result.counts;
    const counts = `- Public repos: ${c.publicCount}\n- Private repos: ${c.privateCount}\n- Forks owned: ${result.forks.length} (public: ${c.forksPublicCount}, private: ${c.forksPrivateCount})\n- Stale repos (>${args.olderThanDays} days): ${result.staleList.length} (public: ${c.stalePublicCount}, private: ${c.stalePrivateCount})\n- Archived repos: ${result.archivedCandidates.length} (public: ${c.archivedPublicCount}, private: ${c.archivedPrivateCount})\n- Empty repos: ${result.trulyEmpty.length} (public: ${c.emptyPublicCount}, private: ${c.emptyPrivateCount})\n- Active/Other repos: ${result.active.length} (public: ${c.activePublicCount}, private: ${c.activePrivateCount})\n\n`;
    if (!client) throw new Error('GitHub client is required');
    const mapped = await categorizeReposWithMetadata(client, result.active, { fetch: true });
    let table = toMarkdownTable(mapped, { title: 'Active Repositories', includeFrontmatter: false });
    const md = addGeneratedTimestamp(header + counts + table, 'Repository Summary');
    await emitOutput(md, args.summaryOut);
  }
}

export async function summaryCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args, client);
}

export default summaryCommand;
