/**
 * Command: archive-stale-repos
 *
 * Purpose:
 *   Find repositories with no recent activity and optionally archive them.
 *
 * Flags:
 *   - `--older-than-days=<n>`: days of inactivity to consider a repo stale (default 365)
 *   - `--yes`, `--force`, `--out=<path>`, `--allow-forks`
 *   - common flags from `parseBaseFlags()` (e.g. `--debug`, `--debug-dir`)
 *
 * Exports:
 *   - `parseArgs(argv)`, `runCommand(client, args)`, `writeOutput(result, args)`
 *   - `archiveStaleReposCommand(argv)` — thin CLI wrapper used by the bin
 *
 * Notes:
 *   Keep this header updated when flags or behavior change; update Markdown docs accordingly.
 */

import { GitHubClient, repos, pagination } from 'github-rest';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { reportError, extractStatus, getDebugConfig } from '../lib/debug.js';

export type Args = BaseFlags & { olderThanDays?: number; excludeForks?: boolean };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, olderThanDays: DEFAULT_STALE_DAYS, excludeForks: true };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.excludeForks = false;
  }
  return args;
}

export async function runCommand(client: any, args: Args): Promise<any> {
  const debugConfig = getDebugConfig(args.debug);
  let all: any[] = [];
  let error: any = null;
  try {
    all = await pagination.paginateAll(async (page: number) => repos.listAuthenticatedUserRepos(client, page, 100));
  } catch (err: any) {
    error = reportError(err, debugConfig);
    return { candidates: [], details: [], archived: [], status: extractStatus(err), error };
  }
  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);
  const maybe = all.filter((r: any) => repos.repoIsEligibleForStale(r as any, { excludeForks: args.excludeForks }));
  let flags: boolean[] = [];
  try {
    flags = await Promise.all(maybe.map((r: any) => repos.isStale(client, r as any, cutoff)));
  } catch (err: any) {
    error = reportError(err, debugConfig);
    return { candidates: [], details: [], archived: [], status: extractStatus(err), error };
  }
  const candidates = maybe.filter((_: any, i: number) => flags[i]);
  if (candidates.length === 0) {
    return { candidates: [], details: [], archived: [], status: 'ok' };
  }
  const details = candidates.map((c: any) => ({ full_name: c.full_name, html_url: c.html_url, pushed_at: c.pushed_at, size: c.size }));
  if (!args.yes) {
    return { candidates, details, archived: [], status: 'dry-run' };
  }
  if (!args.force) {
    const ok = await requireTypedConfirmation('Type YES to archive the listed repositories:');
    if (!ok) {
      return { candidates, details, archived: [], status: 'aborted' };
    }
  }
  const archived: string[] = [];
  for (const c of candidates) {
    let archiveError = null;
    try {
      await repos.archiveRepo(client, c.full_name.split('/')[0], c.full_name.split('/')[1], { dryRun: false });
      archived.push(c.full_name);
    } catch (e: any) {
      archiveError = reportError(e, debugConfig);
      c.archiveError = archiveError;
    }
  }
  return { candidates, details, archived, status: 'ok' };
}

export async function writeOutput(result: any, args: Args) {
  const details = (result && result.details) || [];
  if (args.out) await emitOutput(formatJsonOutput(details), args.out);
}

export async function archiveStaleReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/archive-stale' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
