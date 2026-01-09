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
import { getOutputPath } from '../lib/outputOrganizer.js';
import { getRepoPermissions, hasAdminPermission } from '../lib/permissions.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import { resolveReposFromInput } from '../lib/repo-utils.js';

export type Args = BaseFlags & { excludeForks?: boolean; input?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, excludeForks: !argv.includes('--allow-forks') };
  for (const a of argv) {
    if (a.startsWith('--input=')) args.input = a.split('=', 2)[1];
  }
  return args;
}

export async function runCommand(client: GitHubClient, args: Args) {
  // If an input file is provided, use it as the repo list; otherwise delegate to helper
  let candidates: any[] = [];
  const fromInput = await resolveReposFromInput(client, args.input);
  if (Array.isArray(fromInput)) {
    for (const r of fromInput) {
      if (args.excludeForks && (r as any).fork) continue;
      if ((r as any).size === 0) candidates.push(r);
    }
  } else {
    // Delegate candidate-finding (and optional verification) to the REST helper.
    candidates = await repos.findEmptyRepos(client, { excludeForks: args.excludeForks, verify: true });
  }

  console.log(`Found ${candidates.length} candidate empty repo(s) (size === 0 — 0 KB).`);
  if (candidates.length === 0) {
    return { toDelete: [] };
  }

  const toDelete = [] as Array<{ full_name: string; owner: string; name: string; permissions?: any }>;
  for (const r of candidates) {
    const permissions = await getRepoPermissions(client, r as any);
    toDelete.push({ full_name: r.full_name, owner: r.owner.login, name: r.name, permissions: args.audit ? permissions : undefined });
  }

  console.log(`Matched ${toDelete.length} empty repo(s) after metadata checks.`);

  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform deletions.');
    return { toDelete };
  }

  if (!args.force) {
    console.log('About to delete the repositories listed above. This is destructive.');
    const ok = await requireTypedConfirmation('Type YES to delete the listed repositories:');
    if (!ok) {
      console.log('Aborted by user.');
      return { toDelete };
    }
  }

  const deleted: string[] = [];
  for (const d of toDelete) {
    const ok = await hasAdminPermission(client, d);
    if (!ok) {
      console.warn(`Skipping ${d.full_name}: no admin permission`);
      continue;
    }
    try {
      const did = await repos.deleteRepo(client, d.owner, d.name, { dryRun: false });
      console.log(`Deleted ${d.full_name}: ${did}`);
      deleted.push(d.full_name);
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
    }
  }
  return { toDelete, deleted };
}

export async function writeOutput(result: any, args: Args) {
  const out = (result && result.toDelete) || [];
  const target = args.out || getOutputPath({ group: 'maintenance', filename: 'delete-empty.json' });
  await emitOutput(formatJsonOutput(out), target);
}

export async function deleteEmptyReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/delete-empty' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
