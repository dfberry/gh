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
  const all = await pagination.paginateAll(async (page: number) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);

  const maybe = all.filter((r: any) => repos.repoIsEligibleForStale(r as any, { excludeForks: args.excludeForks }));
  const flags = await Promise.all(maybe.map((r: any) => repos.isStale(client, r as any, cutoff)));
  const candidates = maybe.filter((_: any, i: number) => flags[i]);

  console.log(`Found ${candidates.length} stale repo(s) older than ${args.olderThanDays} days.`);
  if (candidates.length === 0) {
    return { candidates: [] };
  }

  const details = candidates.map((c: any) => ({ full_name: c.full_name, html_url: c.html_url, pushed_at: c.pushed_at, size: c.size }));

  if (!args.yes) {
    // report only
    return { candidates, details };
  }

  if (!args.force) {
    console.log('About to archive the repositories listed above. This is destructive (archive).');
    const ok = await requireTypedConfirmation('Type YES to archive the listed repositories:');
    if (!ok) {
      console.log('Aborted by user.');
      return { candidates, details };
    }
  }

  const archived: string[] = [];
  for (const c of candidates) {
    try {
      const did = await repos.archiveRepo(client, c.full_name.split('/')[0], c.full_name.split('/')[1], { dryRun: false });
      console.log(`Archived ${c.full_name}: ${did}`);
      archived.push(c.full_name);
    } catch (e: any) {
      console.error(`Failed to archive ${c.full_name}:`, e?.message ?? e);
    }
  }
  return { candidates, details, archived };
}

export async function writeOutput(result: any, args: Args) {
  const details = (result && result.details) || [];
  if (args.out) await emitOutput(formatJsonOutput(details), args.out);
}

export async function archiveStaleReposCommand(argv: string[], client?: any) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
