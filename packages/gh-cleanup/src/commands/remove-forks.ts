import { GitHubClient, repos, pagination, hasAdminPermission } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';

type Args = { yes?: boolean; force?: boolean; out?: string; audit?: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: argv.includes('--yes'), force: argv.includes('--force'), out: '', audit: true };
  for (const a of argv) {
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a === '--no-audit') args.audit = false;
    if (a === '--audit') args.audit = true;
  }
  return args;
}

export async function removeForksCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/remove-forks' });

  // validate token and scopes using shared helper
  let me: string;
  try {
    const { login, scopes, missing } = await (async () => {
      const m = await import('github-rest');
      return m.getActorWithScopeCheck(client, ['repo', 'delete_repo']);
    })();
    me = login;
    console.log('Token scopes:', scopes.join(', ') || '(none)');
    if (missing.length > 0) {
      console.warn('Warning: token is missing required scopes:', missing.join(', '), 'Destructive operations may fail.');
    }
  } catch (err: any) {
    console.error('Failed to validate GH_TOKEN or fetch authenticated user:', err?.message ?? err);
    return;
  }

  const all = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const ownedForks = all.filter((r) => r.fork && r.owner?.login === me);

  const foundCount = ownedForks.length;
  console.log(`Found ${foundCount} fork(s) owned by ${me}`);
  if (ownedForks.length === 0) {
    if (args.out) await emitOutput(formatJsonOutput([]), args.out);
    return;
  }

  const details = [] as Array<{ full_name: string; html_url: string; size: number; permissions?: any; willDelete?: boolean }>;
  for (const f of ownedForks) {
    try {
      const full = await repos.getRepo(client, f.owner.login, f.name);
      details.push({ full_name: full.full_name, html_url: full.html_url, size: full.size, permissions: args.audit ? full.permissions : undefined, willDelete: false });
    } catch (e) {
      details.push({ full_name: f.full_name, html_url: f.html_url, size: f.size, permissions: undefined, willDelete: false });
    }
  }

  await emitOutput(formatJsonOutput(details), args.out);

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

  for (const d of details) {
    try {
      const [owner, name] = d.full_name.split('/');
      const ok = await hasAdminPermission(client, owner, name);
      if (!ok) {
        console.warn(`Skipping ${d.full_name}: token does not have admin permission.`);
        continue;
      }
      const did = await repos.deleteRepo(client, owner, name, { dryRun: false });
      console.log(`Deleted ${d.full_name}: ${did}`);
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
    }
  }
  const deleted = details.length; // details contains targets attempted
  console.log(`Deletion attempted for ${deleted} repository(ies).`);
}
