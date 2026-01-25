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
import type { GitHubClient } from 'github-rest';
import { repos, pagination } from 'github-rest';
import wrapGitHubRest, { GitHubRestResult } from '../lib/github-rest-wrapper.js';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import { resolveInputFilePath } from '../lib/input-file-utils.js';

export type Args = BaseFlags & { olderThanDays?: number; excludeForks?: boolean; input?: string; inputFile?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, olderThanDays: DEFAULT_STALE_DAYS, excludeForks: true };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.excludeForks = false;
    if (a.startsWith('--input=')) args.input = a.split('=', 2)[1];
    if (a.startsWith('--input-file=')) args.inputFile = a.split('=', 2)[1];
  }
  return args;
}

export async function runCommand(client: any, args: Args): Promise<any> {
  let all: any[] = [];
  const inputPath = resolveInputFilePath((args as any).inputFile, args.input);
  console.log('Incoming input path:', inputPath || '(none)');
  if (inputPath) {
    const repoNames = await parseRepoInput(inputPath);
    for (const full of repoNames) {
      try {
        const [owner, name] = full.split('/');
        const r: GitHubRestResult<any> = await wrapGitHubRest(() => repos.getRepo(client, owner, name));
        if (r.ok && r.data) all.push(r.data);
        else console.warn(`Failed to fetch repo ${full}:`, r.response?.message || r.original || 'unknown');
      } catch (e) {
        // ignore fetch failures
      }
    }
  } else {
    all = await pagination.paginateAll(async (page: number) => {
      return repos.listAuthenticatedUserRepos(client, page, 100);
    });
  }

  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);

  const maybe = all.filter((r: any) => repos.repoIsEligibleForStale(r as any, { excludeForks: args.excludeForks }));
  const staleResults = await Promise.all(maybe.map((r: any) => wrapGitHubRest(() => repos.isStale(client, r as any, cutoff))));
  const flags = staleResults.map((res) => !!res.data);
  const candidates = maybe.filter((_: any, i: number) => flags[i]);

  console.log(`Found ${candidates.length} stale repo(s) older than ${args.olderThanDays} days.`);
  if (candidates.length === 0) {
    const results = maybe.map((r: any, i: number) => {
      const res = staleResults[i];
      return {
        full_name: r.full_name,
        stale: res.ok ? !!res.data : null,
        message: res.response?.details || res.response?.message || (res.ok ? 'ok' : 'error'),
        status: res.response?.status ?? (res.ok ? 'ok' : 'error'),
        repo: r,
      };
    });
    return { candidates: [], inputPath, results };
  }

  const details = candidates.map((c: any) => ({ full_name: c.full_name, html_url: c.html_url, pushed_at: c.pushed_at, size: c.size }));
  const results = maybe.map((r: any, i: number) => {
    const res = staleResults[i];
    return {
      full_name: r.full_name,
      stale: res.ok ? !!res.data : null,
      message: res.response?.details || res.response?.message || (res.ok ? 'ok' : 'error'),
      status: res.response?.status ?? (res.ok ? 'ok' : 'error'),
      repo: r,
    };
  });

  if (!args.yes) {
    // report only
    return { candidates, details, inputPath };
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
      const [owner, name] = c.full_name.split('/');
      const res = await wrapGitHubRest(() => repos.archiveRepo(client, owner, name, { dryRun: false }));
      if (res.ok) {
        console.log(`Archived ${c.full_name}`);
        archived.push(c.full_name);
      } else {
        console.error(`Failed to archive ${c.full_name}:`, res.response?.message || res.original || 'unknown');
      }
    } catch (e: any) {
      console.error(`Failed to archive ${c.full_name}:`, e?.message ?? e);
    }
  }
  return { candidates, details, archived, inputPath, results };
}

export async function writeOutput(result: any, args: Args) {
  const details = (result && result.details) || [];
  if (args.out) {
    const outObj = { inputPath: result?.inputPath || (args as any).inputFile || args.input || null, details };
    await emitOutput(JSON.stringify(outObj, null, 2), args.out);
  }
}

export async function archiveStaleReposCommand(argv: string[], client?: any) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
