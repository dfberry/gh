import { GitHubClient, repos, pagination, hasAdminPermission } from 'github-rest';
import wrapGitHubRest from '../lib/github-rest-wrapper.js';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import { resolveInputFilePath } from '../lib/input-file-utils.js';

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
  const base = parseBaseFlags(argv) as any;
  const args: any = { ...base };
  for (const a of argv) {
    if (a.startsWith('--input=')) args.input = a.split('=', 2)[1];
    if (a.startsWith('--input-file=')) args.inputFile = a.split('=', 2)[1];
  }
  return args as Args;
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

  const all = await pagination.paginateAll(async (page: number) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  let ownedForks = all.filter((r: any) => r.fork && r.owner?.login === me);
  const inputPath = resolveInputFilePath((args as any).inputFile, (args as any).input);
  console.log('Incoming input path:', inputPath || '(none)');
  if (inputPath) {
    const repoNames = parseRepoInput(inputPath);
    const set = new Set(repoNames.map(String));
    ownedForks = ownedForks.filter((r: any) => set.has(r.full_name));
  }

  const foundCount = ownedForks.length;
  console.log(`Found ${foundCount} fork(s) owned by ${me}`);
  if (ownedForks.length === 0) {
    return { details: [], deleted: 0, inputPath };
  }

  const details = [] as Array<{ full_name: string; html_url: string; size: number; permissions?: any; willDelete?: boolean; parent?: string }>;
  const results: any[] = [];
  for (const f of ownedForks) {
    try {
      const fullRes = await wrapGitHubRest(() => repos.getRepo(client, f.owner.login, f.name));
      if (fullRes.ok && fullRes.data) {
        const full = fullRes.data as any;
        details.push({ full_name: full.full_name, html_url: full.html_url, size: full.size, permissions: args.audit ? full.permissions : undefined, willDelete: false, parent: full.parent ? full.parent.full_name : undefined });
        results.push({ full_name: full.full_name, repo: full, message: fullRes.response?.details || fullRes.response?.message || (fullRes.ok ? 'ok' : 'error'), status: fullRes.response?.status ?? (fullRes.ok ? 'ok' : 'error') });
      } else {
        details.push({ full_name: f.full_name, html_url: f.html_url, size: f.size, permissions: undefined, willDelete: false, parent: undefined });
        results.push({ full_name: f.full_name, repo: null, message: fullRes.response?.details || fullRes.response?.message || 'error', status: fullRes.response?.status ?? 'error' });
      }
    } catch (e) {
      details.push({ full_name: f.full_name, html_url: f.html_url, size: f.size, permissions: undefined, willDelete: false, parent: undefined });
      results.push({ full_name: f.full_name, repo: null, message: String(e), status: 'error' });
    }
  }

  // Deletions and checks
  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform deletions.');
    return { details, deleted: 0, inputPath };
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
            const searchRes = await wrapGitHubRest(() => (client as any).rawRequest('GET', `/search/issues?q=${encodeURIComponent(q)}&per_page=1`));
            if (!searchRes.ok || !searchRes.data) {
              console.warn(`Could not verify open PRs for parent ${parentFull}:`, searchRes.response?.message || searchRes.original || 'unknown');
              console.warn(`Skipping ${d.full_name}: unable to confirm no active PRs in parent.`);
              continue;
            }
            const resBody = (searchRes.data as any) ?? {};
            const count = (resBody && (resBody.total_count ?? resBody.total)) ?? 0;
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
      const okRes = await wrapGitHubRest(() => hasAdminPermission(client, owner, name));
      if (!okRes.ok || !okRes.data) {
        console.warn(`Skipping ${d.full_name}: token does not have admin permission.`);
        if (args.debug) console.log(`DEBUG: Ignored ${d.full_name} because token lacks admin permission.`);
        results.push({ full_name: d.full_name, action: 'skip_no_admin', message: okRes.response?.details || okRes.response?.message || 'no_admin', status: okRes.response?.status ?? 'skipped' });
        continue;
      }
      if (args.debug) console.log(`DEBUG: Deleting ${d.full_name}`);
      const delRes = await wrapGitHubRest(() => repos.deleteRepo(client, owner, name, { dryRun: false }));
      if (delRes.ok) {
        console.log(`Deleted ${d.full_name}`);
        deletedCount++;
        results.push({ full_name: d.full_name, action: 'deleted', message: 'deleted', status: 'ok' });
      } else {
        console.error(`Failed to delete ${d.full_name}:`, delRes.response?.message || delRes.original || 'unknown');
        results.push({ full_name: d.full_name, action: 'delete_failed', message: delRes.response?.message || String(delRes.original), status: delRes.response?.status ?? 'error' });
      }
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
    }
  }
  console.log(`Deletion attempted for ${deletedCount} repository(ies).`);
  return { details, deleted: deletedCount, inputPath };
}

export async function writeOutput(result: any, args: Args) {
  if (args.out) {
    const outObj = { inputPath: result?.inputPath || (args as any).inputFile || (args as any).input || null, details: result.details ?? [], deleted: result.deleted ?? 0 };
    await emitOutput(JSON.stringify(outObj, null, 2), args.out);
  }
}

export async function removeForksCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
