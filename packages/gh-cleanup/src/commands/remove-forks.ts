import { GitHubClient, repos, pagination, hasAdminPermission } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { reportError, extractStatus, getDebugConfig } from '../lib/debug.js';

export type Args = BaseFlags;
/**
 * Command: remove-forks
 *
 * Purpose:
 *   Remove forked repositories where the authenticated user has no open PRs
 *   in the parent repository. Skips deletion when active PRs authored by the
 *   user exist in the parent to avoid breaking in-flight contributions.
 *
 * Flags:
 *   - common base flags via `parseBaseFlags()` (e.g. `--debug`, `--debug-dir`)
 *   - `--yes` to actually apply deletions (otherwise a dry-run)
 *
 * Exports:
 *   - `parseArgs(argv)`, `runCommand(client,args)`, `writeOutput(result,args)`
 *   - `removeForksCommand(argv)` — thin CLI wrapper used by the bin
 */
export function parseArgs(argv: string[]): Args {
  return parseBaseFlags(argv) as Args;
}

export async function runCommand(client: GitHubClient, args: Args) {
  const debugConfig = getDebugConfig(args.debug);
  let me: string = '';
  let error: any = null;
  try {
    const { login } = await (await import('github-rest')).getActorWithScopeCheck(client, ['repo', 'delete_repo']);
    me = login;
  } catch (err: any) {
    error = reportError(err, debugConfig);
    return { details: [], deleted: 0, status: extractStatus(err), error };
  }
  let all: any[] = [];
  try {
    all = await pagination.paginateAll(async (page: number) => repos.listAuthenticatedUserRepos(client, page, 100));
  } catch (err: any) {
    error = reportError(err, debugConfig);
    return { details: [], deleted: 0, status: extractStatus(err), error };
  }
  const ownedForks = all.filter((r: any) => r.fork && r.owner?.login === me);
  if (ownedForks.length === 0) {
    return { details: [], deleted: 0, status: 'ok' };
  }
  const details: any[] = [];
  for (const f of ownedForks) {
    try {
      const full = await repos.getRepo(client, f.owner.login, f.name);
      details.push({ full_name: full.full_name, html_url: full.html_url, size: full.size, permissions: args.audit ? full.permissions : undefined, willDelete: false, parent: (full as any).parent ? (full as any).parent.full_name : undefined });
    } catch (e) {
      details.push({ full_name: f.full_name, html_url: f.html_url, size: f.size, permissions: undefined, willDelete: false, parent: undefined, getRepoError: reportError(e, debugConfig) });
    }
  }
  if (!args.yes) {
    return { details, deleted: 0, status: 'dry-run' };
  }
  if (!args.force) {
    const ok = await requireTypedConfirmation('Type YES to delete the listed repositories:');
    if (!ok) {
      return { details, deleted: 0, status: 'aborted' };
    }
  }
  let deletedCount = 0;
  for (const d of details) {
    let deleteError = null;
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
            d.skipReason = `User ${me} has ${count} open PR(s) in parent ${parentFull}`;
            continue;
          }
        } catch (err: any) {
          d.skipReason = `Could not verify open PRs for parent ${parentFull}: ${(err?.message ?? err)}`;
          continue;
        }
      }
      const ok = await hasAdminPermission(client, owner, name);
      if (!ok) {
        d.skipReason = 'Token does not have admin permission.';
        continue;
      }
      await repos.deleteRepo(client, owner, name, { dryRun: false });
      d.deleted = true;
      deletedCount++;
    } catch (e: any) {
      deleteError = reportError(e, debugConfig);
      d.deleteError = deleteError;
    }
  }
  return { details, deleted: deletedCount, status: 'ok' };
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
