import { GitHubClient, repos, pagination } from 'github-rest';
import { toMarkdownTable, Categorized, addGeneratedTimestamp, emitOutput } from '../lib/report.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type Args = { fetch?: boolean; output?: 'json' | 'md'; out?: string; rules?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { fetch: argv.includes('--fetch'), output: 'json', out: '' };
  for (const a of argv) {
    if (a.startsWith('--output=')) args.output = a.split('=')[1] as any;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a.startsWith('--rules=')) args.rules = a.split('=')[1];
  }
  return args;
}

import { scoreCategory, loadRules, Rule } from '../lib/categorizer.js';
import { categorizeReposWithMetadata } from '../lib/repo-utils.js';

export async function categorizeReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/categorize' });

  const all = await pagination.paginateAll(async (page) => {
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

  if (args.output === 'md') {
    let md = toMarkdownTable(results, { title: 'Repository Catalog', includeFrontmatter: true });
    md = addGeneratedTimestamp(md, 'Repository Catalog');
    await emitOutput(md, args.out);
  } else {
    const out = JSON.stringify(results, null, 2);
    await emitOutput(out, args.out);
  }
}
