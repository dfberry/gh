import { GitHubClient, repos, pagination } from 'github-rest';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';

type Args = { yes?: boolean; force?: boolean; olderThanDays?: number; excludeForks?: boolean; out?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: argv.includes('--yes'), force: argv.includes('--force'), olderThanDays: DEFAULT_STALE_DAYS, excludeForks: true, out: '' };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.excludeForks = false;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
  }
  return args;
}

export async function archiveStaleReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/archive-stale' });

  const all = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const cutoff = new Date(Date.now() - (args.olderThanDays ?? 365) * 24 * 60 * 60 * 1000);

  // Use the REST package eligibility helper for cheap exclusions, then verify staleness
  const maybe = all.filter((r) => repos.repoIsEligibleForStale(r as any, { excludeForks: args.excludeForks }));
  const flags = await Promise.all(maybe.map((r) => repos.isStale(client, r as any, cutoff)));
  const candidates = maybe.filter((_, i) => flags[i]);

  console.log(`Found ${candidates.length} stale repo(s) older than ${args.olderThanDays} days.`);
  if (candidates.length === 0) {
    // ensure output file exists even when empty
    await emitOutput(formatJsonOutput([]), args.out);
    return;
  }

  const details = candidates.map((c) => ({ full_name: c.full_name, html_url: c.html_url, pushed_at: c.pushed_at, size: c.size }));
  await emitOutput(formatJsonOutput(details), args.out);

  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform archiving.');
    return;
  }

  if (!args.force) {
    console.log('About to archive the repositories listed above. This is destructive (archive).');
    const ok = await requireTypedConfirmation('Type YES to archive the listed repositories:');
    if (!ok) {
      console.log('Aborted by user.');
      return;
    }
  }

  for (const c of candidates) {
    try {
      const did = await repos.archiveRepo(client, c.full_name.split('/')[0], c.full_name.split('/')[1], { dryRun: false });
      console.log(`Archived ${c.full_name}: ${did}`);
    } catch (e: any) {
      console.error(`Failed to archive ${c.full_name}:`, e?.message ?? e);
    }
  }
}
