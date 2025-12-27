import { GitHubClient } from 'github-rest';
import { Categorized } from './report.js';
import { scoreCategory } from './categorizer.js';

export type RepoInput = any;

export type CategorizeOptions = {
  fetch?: boolean;
  providedRules?: any[];
};

export async function categorizeReposWithMetadata(client: GitHubClient, repos: RepoInput[], opts: CategorizeOptions = {}): Promise<Categorized[]> {
  const results: Categorized[] = [];
  for (const r of repos) {
    let languages: Record<string, number> | null = null;
    let readmeText: string | null = null;
    try {
      if (opts.fetch) {
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

    const { category, confidence } = await scoreCategory(r, languages, readmeText, (r as any).topics, opts.providedRules);
    results.push({
      full_name: r.full_name,
      html_url: r.html_url,
      description: (r as any).description ?? null,
      language: r.language ?? null,
      topics: (r as any).topics,
      category,
      confidence,
      last_updated: r.pushed_at ?? null,
      stars: (r as any).stargazers_count ?? null,
    });
  }
  return results;
}

export default { categorizeReposWithMetadata };
