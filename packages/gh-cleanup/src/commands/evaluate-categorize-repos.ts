/**
 * Command: categorize-repos
 *
 * Purpose:
 *   Analyze repositories and produce category assignments (library, cli, infra, docs, sample, etc.).
 *
 * Flags:
 *   - `--fetch`: fetch languages and README to improve categorization
 *   - `--output=json|md`, `--out=<path>`, `--rules=<path>`
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
import { toMarkdownTable, Categorized, addGeneratedTimestamp, emitOutput, formatJsonOutput } from '../lib/report.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

type Args = BaseFlags & { fetch?: boolean; output?: 'json' | 'md'; rules?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, fetch: argv.includes('--fetch'), output: 'json' };
  for (const a of argv) {
    if (a.startsWith('--output=')) args.output = a.split('=')[1] as any;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a.startsWith('--rules=')) args.rules = a.split('=')[1];
  }
  return args;
}

import { scoreCategory, loadRules, Rule } from '../lib/categorizer.js';
import { categorizeReposWithMetadata } from '../lib/repo-utils.js';

export async function runCommand(client: GitHubClient, args: Args) {
  const all = await pagination.paginateAll(async (page: number) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const results: Categorized[] = [];
  let providedRules: Rule[] | undefined;
  if (args.rules) {
    try {
      providedRules = await loadRules(args.rules);
    } catch (e) {
      console.warn('Failed to load custom rules, falling back to bundled rules:', (e as any)?.message ?? e);
      providedRules = undefined;
    }
  }

  // Use shared helper to fetch optional metadata and score repos
  const fetched = await categorizeReposWithMetadata(client, all, { fetch: args.fetch, providedRules });
  results.push(...fetched);
  return results;
}

export async function writeOutput(result: any, args: Args) {
  const results: Categorized[] = result || [];
  if (args.output === 'md') {
    let md = toMarkdownTable(results, { title: 'Repository Catalog', includeFrontmatter: true });
    md = addGeneratedTimestamp(md, 'Repository Catalog');
    await emitOutput(md, args.out);
  } else {
    await emitOutput(formatJsonOutput(results), args.out);
  }
}

export async function categorizeReposCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
