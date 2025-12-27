import { GitHubClient, repos, pagination } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput } from '../lib/report.js';

type Args = { yes?: boolean; force?: boolean; excludeForks?: boolean; out?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: argv.includes('--yes'), force: argv.includes('--force'), excludeForks: !argv.includes('--allow-forks'), out: '' };
  for (const a of argv) {
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
  }
  return args;
}

export async function deleteEmptyReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/delete-empty' });

  const all = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const candidates = all.filter((r) => {
    if (r.archived) return false;
    if (args.excludeForks && r.fork) return false;
    return r.size === 0;
  });
  console.log(`Found ${candidates.length} candidate empty repo(s) (size === 0 — 0 KB).`);
  if (candidates.length === 0) return;

  const toDelete = [] as Array<{ full_name: string; owner: string; name: string; permissions?: any }>;
  for (const r of candidates) {
    let empty = false;
    try {
      empty = await repos.isRepoEmpty(client, r as any);
    } catch (err) {
      console.warn(`Failed to determine emptiness for ${r.full_name}:`, (err as any)?.message ?? err);
      continue;
    }
    if (!empty) continue;

    // ensure we have admin permission before attempting delete
    let permissions = r.permissions;
    if (!permissions) {
      try {
        const full = await repos.getRepo(client, r.owner.login, r.name);
        permissions = full.permissions;
      } catch {
        permissions = undefined;
      }
    }
    toDelete.push({ full_name: r.full_name, owner: r.owner.login, name: r.name, permissions });
  }

  console.log(`Matched ${toDelete.length} empty repo(s) after metadata checks.`);
  await emitOutput(JSON.stringify(toDelete, null, 2), args.out);

  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform deletions.');
    return;
  }

  if (!args.force) {
    console.log('About to delete the repositories listed above. This is destructive.');
    const ok = await requireTypedConfirmation('Type YES to delete the listed repositories:');
    if (!ok) {
      console.log('Aborted by user.');
      return;
    }
  }

  for (const d of toDelete) {
    if (d.permissions && d.permissions.admin === false) {
      console.warn(`Skipping ${d.full_name}: no admin permission`);
      continue;
    }
    try {
      const did = await repos.deleteRepo(client, d.owner, d.name, { dryRun: false });
      console.log(`Deleted ${d.full_name}: ${did}`);
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
    }
  }
}
