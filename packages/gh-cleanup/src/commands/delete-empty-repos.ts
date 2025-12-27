import { GitHubClient, repos, pagination } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';

type Args = { yes?: boolean; force?: boolean; excludeForks?: boolean };

function parseArgs(argv: string[]): Args {
  return { yes: argv.includes('--yes'), force: argv.includes('--force'), excludeForks: !argv.includes('--allow-forks') };
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

  console.log(`Found ${candidates.length} candidate empty repo(s) (size === 0).`);
  if (candidates.length === 0) return;

  // Enrich metadata (commits, pulls)
  const metaMap = await repos.enrichReposMetadata(client, candidates);

  const toDelete = [] as Array<{ full_name: string; owner: string; name: string; commits: number; pulls: number; permissions?: any }>;
  for (const r of candidates) {
    const m = metaMap[r.full_name];
    const commits = m?.commits ?? 0;
    const pulls = m?.pulls ?? 0;
    // repo is considered empty if no commits and no PRs
    if (commits === 0 && pulls === 0) {
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
      toDelete.push({ full_name: r.full_name, owner: r.owner.login, name: r.name, commits, pulls, permissions });
    }
  }

  console.log(`Matched ${toDelete.length} empty repo(s) after metadata checks.`);
  console.log(JSON.stringify(toDelete, null, 2));

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
