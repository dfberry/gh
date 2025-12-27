import { GitHubClient, repos, pagination } from 'github-rest';
import { toMarkdownTable, Categorized } from '../lib/report.js';
import * as fs from 'node:fs/promises';

type Args = { fetch?: boolean; output?: 'json' | 'md'; out?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { fetch: argv.includes('--fetch'), output: 'json', out: '' };
  for (const a of argv) {
    if (a.startsWith('--output=')) args.output = a.split('=')[1] as any;
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
  }
  return args;
}

function scoreCategory(repo: any, languages: Record<string, number> | null, readmeText: string | null, topics: string[] | undefined): { category: string; confidence: number } {
  const text = (readmeText ?? '').toLowerCase();
  const t = (topics ?? []).map((s) => s.toLowerCase());

  const has = (pat: string) => text.includes(pat) || t.includes(pat);
  const langList = languages ? Object.keys(languages).map((l) => l.toLowerCase()) : [];

  // heuristics
  if (t.includes('cli') || has('\bcli\b') || langList.includes('go') || langList.includes('shell')) return { category: 'cli', confidence: 0.85 };
  if (t.includes('library') || has('library') || has('module') || repo.name?.includes('lib')) return { category: 'library', confidence: 0.8 };
  if (has('terraform') || has('docker') || t.includes('infrastructure') || langList.includes('hcl')) return { category: 'infra', confidence: 0.9 };
  if (t.includes('docs') || has('documentation') || has('docs') || (repo.size === 0 && has('readme'))) return { category: 'docs', confidence: 0.7 };
  if (has('example') || has('sample') || repo.name?.includes('example')) return { category: 'sample', confidence: 0.85 };
  if (langList.includes('html') || has('website') || has('site')) return { category: 'web', confidence: 0.75 };

  // fallback based on dominant language
  if (langList.length > 0) return { category: langList[0], confidence: 0.5 };
  return { category: 'other', confidence: 0.3 };
}

export async function categorizeReposCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/categorize' });

  const all = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const results: Categorized[] = [];

  for (const r of all) {
    let languages: Record<string, number> | null = null;
    let readmeText: string | null = null;
    try {
      if (args.fetch) {
        languages = await client.get<Record<string, number>>(`/repos/${r.owner.login}/${r.name}/languages`);
        try {
          const rd = await client.get<any>(`/repos/${r.owner.login}/${r.name}/readme`);
          if (rd?.content) {
            const buff = Buffer.from(rd.content, rd.encoding ?? 'base64');
            readmeText = buff.toString('utf8');
          }
        } catch {
          readmeText = null;
        }
      }
    } catch (e) {
      languages = null;
    }

    const { category, confidence } = scoreCategory(r, languages, readmeText, (r as any).topics);
    results.push({ full_name: r.full_name, html_url: r.html_url, description: (r as any).description ?? null, language: r.language ?? null, topics: (r as any).topics, category, confidence, last_updated: r.pushed_at ?? null, stars: (r as any).stargazers_count ?? null });
  }

  if (args.output === 'md') {
    const md = toMarkdownTable(results, { title: 'Repository Catalog', includeFrontmatter: true });
    if (args.out) await fs.writeFile(args.out, md, 'utf8');
    else console.log(md);
  } else {
    const out = JSON.stringify(results, null, 2);
    if (args.out) await fs.writeFile(args.out, out, 'utf8');
    else console.log(out);
  }
}
