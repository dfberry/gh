/**
 * Command: delete-empty-repos
 *
 * Purpose:
 *   Detect repositories that are effectively empty (size===0, no commits, no PRs)
 *   and optionally delete them.
 *
 * Flags:
 *   - `--yes`, `--force`, `--allow-forks`, `--out=<path>`, `--no-audit`
 *   - common base flags via `parseBaseFlags()` (e.g. `--debug`)
 *
 * Exports:
 *   - `parseArgs(argv)`, `runCommand(client, args)`, `writeOutput(result, args)`
 *
 * Notes:
 *   Keep this header updated when flags or behavior change; update Markdown docs accordingly.
 */

import { GitHubClient, repos, pagination } from 'github-rest';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { getRepoPermissions, hasAdminPermission } from 'github-rest';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { reportError, extractStatus, getDebugConfig, handleApiError } from '../lib/debug.js';

export type Args = BaseFlags & { excludeForks?: boolean };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, excludeForks: !argv.includes('--allow-forks') };
  return args;
}

export async function runCommand(client: GitHubClient, args: Args) {
  const debugConfig = getDebugConfig(args.debug);

  // Step 1: Find empty repo candidates
  const { candidates, findStatus } = await findEmptyRepoCandidates(client, args, debugConfig);
  if (findStatus) {
    return { toDelete: [], deleted: [], status: findStatus };
  }
  if (!candidates || candidates.length === 0) {
    return { toDelete: [], deleted: [], status: { code: 200, message: 'ok' } };
  }

  // Step 2: Build toDelete list with permission status
  const toDelete = await buildToDeleteList(client, candidates, args, debugConfig);

  // Step 3: Confirm deletion if required
  if (!args.yes) {
    return { toDelete, deleted: [], status: { code: 202, message: 'dry-run' } };
  }
  if (!args.force) {
    const ok = await requireTypedConfirmation('Type YES to delete the listed repositories:');
    if (!ok) {
      return { toDelete, deleted: [], status: { code: 400, message: 'aborted' } };
    }
  }

  // Step 4: Attempt deletion
  const deleted = await deleteReposWithStatus(client, toDelete, debugConfig);

  return { toDelete, deleted, status: { code: 200, message: 'ok' } };
}
// --- Helpers for runCommand ---

async function findEmptyRepoCandidates(client: GitHubClient, args: Args, debugConfig: any) {
  const { result, status } = await handleApiError(
    () => repos.findEmptyRepos(client, { excludeForks: args.excludeForks, verify: true }),
    debugConfig
  );
  if (status.error) {
    return { candidates: [], findStatus: status };
  }
  return { candidates: result || [], findStatus: null };
}

async function buildToDeleteList(client: GitHubClient, candidates: any[], args: Args, debugConfig: any) {
  const toDelete: any[] = [];
  for (const r of candidates) {
    const { status: permStatus } = await handleApiError(
      () => getRepoPermissions(client, r as any),
      debugConfig
    );
    toDelete.push({
      full_name: r.full_name,
      owner: r.owner.login,
      name: r.name,
      permissions: args.audit,
      status: permStatus
    });
  }
  return toDelete;
}

async function deleteReposWithStatus(client: GitHubClient, toDelete: any[], debugConfig: any) {
  const deleted: string[] = [];
  for (const d of toDelete) {
    const { result: hasAdmin, status: adminStatus } = await handleApiError(
      () => hasAdminPermission(client, d),
      debugConfig
    );
    d.status = adminStatus;
    if (!hasAdmin) {
      continue;
    }
    const { status: delStatus } = await handleApiError(
      () => repos.deleteRepo(client, d.owner, d.name, { dryRun: false }),
      debugConfig
    );
    d.status = delStatus;
    if (!delStatus.error) {
      deleted.push(d.full_name);
      d.deleted = true;
    }
  }
  return deleted;
}

export async function writeOutput(result: any, args: Args) {
  const out = (result && result.toDelete) || [];
  if (args.out) await emitOutput(formatJsonOutput(out), args.out);
}

export async function deleteEmptyReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/delete-empty' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
