export type Categorized = {
  full_name: string;
  html_url?: string;
  description?: string | null;
  language?: string | null;
  topics?: string[] | undefined;
  category: string;
  confidence: number;
  last_updated?: string | null;
  stars?: number | null;
};

export function toMarkdownTable(items: Categorized[], opts?: { title?: string; includeFrontmatter?: boolean }) {
  const title = opts?.title ?? 'Repository Catalog';
  const front = opts?.includeFrontmatter
    ? `---\nlayout: page\ntitle: "${title}"\n---\n\n`
    : '';

  const header = ['Name', 'Description', 'Topics', 'Language', 'Category', 'Last Updated', 'Link'];
  const rows = items.map((it) => {
    const topics = (it.topics ?? []).join(', ');
    const desc = it.description ? it.description.replace(/\|/g, '\\|') : '';
    const link = it.html_url ? `[${it.full_name}](${it.html_url})` : it.full_name;
    return `| ${it.full_name} | ${desc} | ${topics} | ${it.language ?? ''} | ${it.category} (${Math.round(
      it.confidence * 100,
    )}%) | ${it.last_updated ?? ''} | ${link} |`;
  });

  const table = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows].join('\n');
  return front + table;
}
