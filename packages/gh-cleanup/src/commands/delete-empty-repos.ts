import { GitHubClient, repos, pagination } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput } from '../lib/report.js';
import { getRepoPermissions, hasAdminPermission } from 'github-rest';

type Args = { yes?: boolean; force?: boolean; excludeForks?: boolean; out?: string; audit?: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = {
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
    excludeForks: !argv.includes('--allow-forks'),
    out: '',
    audit: true,
  };
  for (const a of argv) {
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a === '--no-audit') args.audit = false;
    if (a === '--audit') args.audit = true;
  }
  return args;
}

export async function deleteEmptyReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/delete-empty' });

  // Delegate candidate-finding (and optional verification) to the REST helper.
  const candidates = await repos.findEmptyRepos(client, { excludeForks: args.excludeForks, verify: true });
  console.log(`Found ${candidates.length} candidate empty repo(s) (size === 0 — 0 KB).`);
  if (candidates.length === 0) {
    // Ensure output file is written even when there are no candidates
    await emitOutput(
      JSON.stringify({ generated_at: new Date().toISOString(), count: 0, items: [] }, null, 2),
      args.out,
    );
    return;
  }

  const toDelete = [] as Array<{ full_name: string; owner: string; name: string; permissions?: any }>;
  for (const r of candidates) {
    // resolve permissions (may be present on the list item or fetched)
    const permissions = await getRepoPermissions(client, r as any);
    toDelete.push({ full_name: r.full_name, owner: r.owner.login, name: r.name, permissions: args.audit ? permissions : undefined });
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
    // Always use centralized `hasAdminPermission` for a single-path permission check.
    const ok = await hasAdminPermission(client, d);
    if (!ok) {
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
