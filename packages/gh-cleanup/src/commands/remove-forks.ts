import { GitHubClient, repos, pagination, hasAdminPermission } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

export type Args = BaseFlags;

export function parseArgs(argv: string[]): Args {
  return parseBaseFlags(argv) as Args;
}

export async function runCommand(client: GitHubClient, args: Args) {
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
    return { details: [], deleted: 0 };
  }

  const all = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const ownedForks = all.filter((r) => r.fork && r.owner?.login === me);

  const foundCount = ownedForks.length;
  console.log(`Found ${foundCount} fork(s) owned by ${me}`);
  if (ownedForks.length === 0) {
    return { details: [], deleted: 0 };
  }

  const details = [] as Array<{ full_name: string; html_url: string; size: number; permissions?: any; willDelete?: boolean; parent?: string }>;
  for (const f of ownedForks) {
    try {
      const full = await repos.getRepo(client, f.owner.login, f.name);
      details.push({ full_name: full.full_name, html_url: full.html_url, size: full.size, permissions: args.audit ? full.permissions : undefined, willDelete: false, parent: (full as any).parent ? (full as any).parent.full_name : undefined });
    } catch (e) {
      details.push({ full_name: f.full_name, html_url: f.html_url, size: f.size, permissions: undefined, willDelete: false, parent: undefined });
    }
  }

  // Deletions and checks
  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform deletions.');
    return { details, deleted: 0 };
  }

  if (!args.force) {
    console.log('About to delete the repositories listed above. This is destructive.');
    const ok = await requireTypedConfirmation('Type YES to delete the listed repositories:');
    if (!ok) {
      console.log('Aborted by user.');
      return { details, deleted: 0 };
    }
  }

  let deletedCount = 0;
  for (const d of details) {
    try {
      const [owner, name] = d.full_name.split('/');
      const parentFull = (d as any).parent as string | undefined;
      if (parentFull) {
        const [pOwner, pName] = parentFull.split('/');
        const q = `repo:${pOwner}/${pName}+is:pr+author:${me}+is:open`;
        try {
          const res = await (client as any).rawRequest('GET', `/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
          const count = (res.body && (res.body.total_count ?? res.body.total)) ?? 0;
          if (count > 0) {
            console.warn(`Skipping ${d.full_name}: user ${me} has ${count} open PR(s) in parent ${parentFull}.`);
            if (args.debug) console.log(`DEBUG: Ignored ${d.full_name} due to ${count} open PR(s) in parent ${parentFull}`);
            continue;
          } else {
            if (args.debug) console.log(`DEBUG: No open PRs by ${me} in parent ${parentFull}; ${d.full_name} eligible for deletion.`);
          }
        } catch (err: any) {
          console.warn(`Could not verify open PRs for parent ${parentFull}:`, err?.message ?? err);
          console.warn(`Skipping ${d.full_name}: unable to confirm no active PRs in parent.`);
          continue;
        }
      }
      const ok = await hasAdminPermission(client, owner, name);
      if (!ok) {
        console.warn(`Skipping ${d.full_name}: token does not have admin permission.`);
        if (args.debug) console.log(`DEBUG: Ignored ${d.full_name} because token lacks admin permission.`);
        continue;
      }
      if (args.debug) console.log(`DEBUG: Deleting ${d.full_name}`);
      const did = await repos.deleteRepo(client, owner, name, { dryRun: false });
      console.log(`Deleted ${d.full_name}: ${did}`);
      deletedCount++;
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
    }
  }
  console.log(`Deletion attempted for ${deletedCount} repository(ies).`);
  return { details, deleted: deletedCount };
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) await emitOutput(formatJsonOutput(result.details ?? []), args.out);
}

export async function removeForksCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/remove-forks' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
