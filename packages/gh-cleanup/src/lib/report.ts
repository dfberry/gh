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
  archived?: boolean;
  fork?: boolean;
  template?: boolean;
  private?: boolean;
  visibility?: string | null;
};

export function toMarkdownTable(items: Categorized[], opts?: { title?: string; includeFrontmatter?: boolean }) {
  const title = opts?.title ?? 'Repository Catalog';
  const front = opts?.includeFrontmatter
    ? `---\nlayout: page\ntitle: "${title}"\n---\n\n`
    : '';

  const header = ['Name', 'Description', 'Topics', 'Language', 'Category', 'Status', 'Last Updated', 'Link'];
  const rows = items.map((it) => {
    const topics = (it.topics ?? []).join(', ');
    const desc = it.description ? it.description.replace(/\|/g, '\\|') : '';
    const link = it.html_url ? `[${it.full_name}](${it.html_url})` : it.full_name;
    const flags: string[] = [];
    if (it.archived) flags.push('archived');
    if (it.fork) flags.push('fork');
    if (it.template) flags.push('template');
    if (it.private) flags.push('private');
    else flags.push('public');
    if (flags.length === 0) flags.push('active');
    const status = flags.join(', ');
    return `| ${it.full_name} | ${desc} | ${topics} | ${it.language ?? ''} | ${it.category} (${Math.round(
      it.confidence * 100,
    )}%) | ${status} | ${it.last_updated ?? ''} | ${link} |`;
  });

  const table = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows].join('\n');
  return front + table;
}

export function addGeneratedTimestamp(md: string, title?: string) {
  const generatedAt = new Date().toISOString();
  if (md.startsWith('---\n')) {
    const endIdx = md.indexOf('\n---', 4);
    if (endIdx === -1) {
      // malformed frontmatter — prepend a clean one
      const front = `---\n${title ? `title: "${title}"\n` : ''}generated_at: "${generatedAt}"\n---\n\n`;
      return front + md;
    }
    const front = md.slice(0, endIdx + 4);
    const rest = md.slice(endIdx + 4);
    const lines = front.split('\n').filter(Boolean);
    // ensure title present if provided
    let hasTitle = false;
    let inserted = false;
    const outLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('title:')) hasTitle = true;
      if (line.startsWith('generated_at:')) {
        outLines.push(`generated_at: "${generatedAt}"`);
        inserted = true;
      } else {
        outLines.push(line);
      }
    }
    if (!hasTitle && title) {
      // insert title after layout if present, else after opening
      const idx = outLines.findIndex((l) => l.startsWith('layout:'));
      if (idx >= 0) outLines.splice(idx + 1, 0, `title: "${title}"`);
      else outLines.splice(1, 0, `title: "${title}"`);
    }
    if (!inserted) {
      // place generated_at near the end of frontmatter
      outLines.splice(outLines.length - 1, 0, `generated_at: "${generatedAt}"`);
    }
    const newFront = outLines.join('\n') + '\n\n';
    return newFront + rest.trimStart();
  }

  const front = `---\nlayout: page\n${title ? `title: "${title}"\n` : ''}generated_at: "${generatedAt}"\n---\n\n`;
  return front + md;
}

import { ensureDirForFile } from './fs.js';
import * as fs from 'node:fs/promises';

export function formatJsonOutput(items: any[], count: number | null = null) {
  return JSON.stringify({ generated_at: new Date().toISOString(), count: count !== null ? count : (Array.isArray(items) ? items.length : 0), items: items ?? [] }, null, 2);
}
/**
 * Write or print output. If `out` is provided, ensures parent dir and writes file,
 * otherwise prints to stdout.
 */
export async function emitOutput(content: string, out?: string) {
  if (out) {
    await ensureDirForFile(out);
    await fs.writeFile(out, content, 'utf8');
  } else {
    console.log(content);
  }
}
