import { GitHubClient, repos, pagination } from 'github-rest';
import { DEFAULT_STALE_DAYS } from '../constants.js';
import { requireTypedConfirmation } from '../lib/confirm.js';

type Args = { yes?: boolean; force?: boolean; olderThanDays?: number; excludeForks?: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: argv.includes('--yes'), force: argv.includes('--force'), olderThanDays: DEFAULT_STALE_DAYS, excludeForks: true };
  for (const a of argv) {
    if (a.startsWith('--older-than-days=')) args.olderThanDays = Number(a.split('=')[1]);
    if (a === '--allow-forks') args.excludeForks = false;
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

  const candidates = all.filter((r) => {
    if (r.archived) return false;
    if (args.excludeForks && r.fork) return false;
    const pushed = r.pushed_at ? new Date(r.pushed_at) : null;
    if (!pushed) return true; // no activity recorded -> candidate
    return pushed < cutoff;
  });

  console.log(`Found ${candidates.length} stale repo(s) older than ${args.olderThanDays} days.`);
  if (candidates.length === 0) return;

  const details = candidates.map((c) => ({ full_name: c.full_name, html_url: c.html_url, pushed_at: c.pushed_at, size: c.size }));
  console.log(JSON.stringify(details, null, 2));

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
