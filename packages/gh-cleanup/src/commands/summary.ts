import { reportError, extractStatus, getDebugConfig } from '../lib/debug.js';
import { GitHubClient, pagination, repos } from 'github-rest';
import { categorizeReposWithMetadata } from '../lib/repo-utils.js';
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

export async function runCommand(client: any, args: Args): Promise<any> {
  const debugConfig = getDebugConfig(args.debug);
  let me: string = '';
  let error: any = null;
  let all: any[] = [];
  try {
    const u = await client.getAuthenticatedUser();
    me = (u as any).login;
  } catch (e: any) {
    error = reportError(e, debugConfig);
    return { status: extractStatus(e), error };
  }
  try {
    all = await pagination.paginateAll(async (page: number) => repos.listAuthenticatedUserRepos(client, page, 100));
  } catch (e: any) {
    error = reportError(e, debugConfig);
    return { status: extractStatus(e), error };
  }
  let forks: any[] = [];
  let cutoff: Date;
  let staleCandidates: any[] = [];
  let archivedCandidates: any[] = [];
  let emptyCandidates: any[] = [];
  let trulyEmpty = new Set<string>();
  let staleSet = new Set<string>();
  let staleList: any[] = [];
  let archivedSet = new Set<string>();
  let owned: any[] = [];
  let forksOwnedSet = new Set<string>();
  let active: any[] = [];
  let privateCount = 0, publicCount = 0, activePrivateCount = 0, activePublicCount = 0;
  let forksPrivateCount = 0, forksPublicCount = 0, stalePrivateCount = 0, stalePublicCount = 0;
  let archivedPrivateCount = 0, archivedPublicCount = 0, emptyPrivateCount = 0, emptyPublicCount = 0;
  try {
    forks = all.filter((r: any) => r.fork && r.owner?.login === me);
    cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);
    staleCandidates = all.filter((r: any) => {
      if (!args.allowForks && r.fork) return false;
      if (r.archived) return false;
      if (!r.pushed_at) return true;
      const pushed = new Date(r.pushed_at);
      return pushed < cutoff;
    });
    archivedCandidates = all.filter((r: any) => {
      if (!args.allowForks && r.fork) return false;
      return Boolean(r.archived);
    });
    emptyCandidates = all.filter((r: any) => {
      if (!args.allowForks && r.fork) return false;
      return r.size === 0;
    });
    await Promise.all(
      emptyCandidates.map(async (r: any) => {
        try {
          const empty = await repos.isRepoEmpty(client, r as any);
          if (empty) trulyEmpty.add(r.full_name);
        } catch (err) {
          r.emptyCheckError = reportError(err, debugConfig);
        }
      })
    );
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
    archivedSet = new Set(archivedCandidates.map((r: any) => r.full_name));
    owned = all.filter((r: any) => r.owner?.login === me);
    forksOwnedSet = new Set(forks.map((r: any) => r.full_name));
    active = owned.filter((r: any) => !forksOwnedSet.has(r.full_name) && !staleSet.has(r.full_name) && !trulyEmpty.has(r.full_name) && !archivedSet.has(r.full_name));
    privateCount = owned.filter((r: any) => Boolean(r.private)).length;
    publicCount = owned.length - privateCount;
    activePrivateCount = active.filter((r: any) => Boolean(r.private)).length;
    activePublicCount = active.length - activePrivateCount;
    forksPrivateCount = forks.filter((r: any) => Boolean(r.private)).length;
    forksPublicCount = forks.length - forksPrivateCount;
    stalePrivateCount = staleList.filter((r: any) => Boolean(r.private)).length;
    stalePublicCount = staleList.length - stalePrivateCount;
    archivedPrivateCount = archivedCandidates.filter((r: any) => Boolean(r.private)).length;
    archivedPublicCount = archivedCandidates.length - archivedPrivateCount;
    const emptyList = emptyCandidates.filter((r: any) => trulyEmpty.has(r.full_name));
    emptyPrivateCount = emptyList.filter((r: any) => Boolean(r.private)).length;
    emptyPublicCount = emptyList.length - emptyPrivateCount;
  } catch (e: any) {
    error = reportError(e, debugConfig);
    return { status: extractStatus(e), error };
  }
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
    status: 'ok',
    error
  };
}

export async function writeOutput(result: any, args: Args) {
  if (!result) return;
  const { active } = result;
  if (args.output) {
    const mapped = await categorizeReposWithMetadata(new GitHubClient({ token: process.env.GH_TOKEN }), active, { fetch: true });
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
    const mapped = await categorizeReposWithMetadata(new GitHubClient({ token: process.env.GH_TOKEN }), result.active, { fetch: true });
    let table = toMarkdownTable(mapped, { title: 'Active Repositories', includeFrontmatter: false });
    const md = addGeneratedTimestamp(header + counts + table, 'Repository Summary');
    await emitOutput(md, args.summaryOut);
  }
}

export async function summaryCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/summary' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}

export default summaryCommand;
