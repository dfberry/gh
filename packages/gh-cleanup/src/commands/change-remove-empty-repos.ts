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
import type { GitHubClient } from 'github-rest';
import { repos, pagination } from 'github-rest';
import wrapGitHubRest from '../lib/github-rest-wrapper.js';
import { requireTypedConfirmation } from '../lib/confirm.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { getRepoPermissions, hasAdminPermission } from 'github-rest';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import { resolveInputFilePath } from '../lib/input-file-utils.js';
import { readJsonFile } from '../lib/files.js';

export type Args = BaseFlags & { excludeForks?: boolean; input?: string; inputFile?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, excludeForks: !argv.includes('--allow-forks') };
  for (const a of argv) {
    if (a.startsWith('--input=')) args.input = a.split('=', 2)[1];
    if (a.startsWith('--input-file=')) args.inputFile = a.split('=', 2)[1];
  }
  return args;
}

export async function runCommand(client: GitHubClient, args: Args) {
  // Deconstruct args and try to read JSON input when provided
  const { input, inputFile } = args as any;
  let candidates: any[] = [];
  const inputPath = resolveInputFilePath(inputFile, input);
  console.log('Incoming input path:', inputPath || '(none)');
  const results: any[] = [];
  if (inputPath) {
    // prefer structured JSON when available
    const raw = await readJsonFile<any>(inputPath).catch(() => null);
    let repoNames: string[] = [];
    if (raw && Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      repoNames = raw as string[];
    } else if (raw && Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
      repoNames = raw.map((it: any) => it.full_name || it.repo || (it.owner && it.name && `${it.owner}/${it.name}`)).filter(Boolean) as string[];
    } else {
      repoNames = await parseRepoInput(inputPath);
    }
    for (const full of repoNames) {
      try {
        const [owner, name] = full.split('/');
        const r = await wrapGitHubRest(() => repos.getRepo(client, owner, name));
        if (r.ok && r.data) {
          const repoData = r.data as any;
          const isCandidate = repoData.size === 0;
          if (isCandidate) candidates.push(repoData);
          results.push({ owner, repoName: name, candidate: isCandidate, repoData, message: r.response?.details || r.response?.message || (r.ok ? 'ok' : 'error'), status: r.response?.status ?? (r.ok ? 'ok' : 'error') });
        } else {
          results.push({ owner: full.split('/')[0], repoName: full.split('/')[1], candidate: false, repoData: null, message: r.response?.details || r.response?.message || 'error', status: r.response?.status ?? 'error' });
        }
      } catch (e) {
        results.push({ owner: full.split('/')[0], repoName: full.split('/')[1], candidate: false, repoData: null, message: String(e), status: 'error' });
      }
    }
  } else {
    candidates = await repos.findEmptyRepos(client, { excludeForks: args.excludeForks, verify: true });
    for (const r of candidates) {
      results.push({ owner: r.owner?.login, repoName: r.name, candidate: true, repoData: r, message: 'found_via_findEmptyRepos', status: 'ok' });
    }
  }
  console.log(`Found ${candidates.length} candidate empty repo(s) (size === 0 — 0 KB).`);
  if (candidates.length === 0) {
    return { toDelete: [], inputPath };
  }

  const toDelete = [] as Array<{ full_name: string; owner: string; name: string; permissions?: any }>;
  for (const r of candidates) {
    const permRes = await wrapGitHubRest(() => getRepoPermissions(client, r as any));
    const permissions = permRes.ok ? permRes.data : undefined;
    toDelete.push({ full_name: r.full_name, owner: r.owner.login, name: r.name, permissions: args.audit ? permissions : undefined });
  }

  console.log(`Matched ${toDelete.length} empty repo(s) after metadata checks.`);

  if (!args.yes) {
    console.log('Dry-run mode. Use --yes to perform deletions.');
    return { toDelete, inputPath, results };
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
    const okRes = await wrapGitHubRest(() => hasAdminPermission(client, d));
    if (!okRes.ok || !okRes.data) {
      console.warn(`Skipping ${d.full_name}: no admin permission`);
      continue;
    }
    try {
      const delRes = await wrapGitHubRest(() => repos.deleteRepo(client, d.owner, d.name, { dryRun: false }));
      if (delRes.ok) {
        console.log(`Deleted ${d.full_name}`);
        deleted.push(d.full_name);
        results.push({ full_name: d.full_name, action: 'deleted', message: 'deleted', status: 'ok' });
      } else {
        console.error(`Failed to delete ${d.full_name}:`, delRes.response?.message || delRes.original || 'unknown');
        results.push({ full_name: d.full_name, action: 'delete_failed', message: delRes.response?.message || String(delRes.original), status: delRes.response?.status ?? 'error' });
      }
    } catch (e: any) {
      console.error(`Failed to delete ${d.full_name}:`, e?.message ?? e);
      results.push({ full_name: d.full_name, action: 'delete_exception', message: e?.message ?? String(e), status: 'error' });
    }
  }
  return { toDelete, deleted, inputPath, results };
}

export async function writeOutput(result: any, args: Args) {
  const out = (result && result.toDelete) || [];
  if (args.out) {
    const outObj = { inputPath: result?.inputPath || (args as any).inputFile || args.input || null, toDelete: out };
    await emitOutput(JSON.stringify(outObj, null, 2), args.out);
  }
}

export async function deleteEmptyReposCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
