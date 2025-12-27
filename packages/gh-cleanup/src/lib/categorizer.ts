import * as fs from 'node:fs/promises';
import rules from '../config/categorization.rules.js';

export type Rule = {
  category: string;
  confidence: number;
  topicsContains?: string[];
  readmeContains?: string[];
  languagesContains?: string[];
  nameContains?: string[];
  sizeEquals?: number;
};

export async function loadRules(path?: string): Promise<Rule[]> {
  if (!path) return rules as Rule[];
  try {
    const txt = await fs.readFile(path, 'utf8');
    return JSON.parse(txt) as Rule[];
  } catch (e) {
    return rules as Rule[];
  }
}

export function matchesRule(rule: Rule, repo: any, languages: Record<string, number> | null, readmeText: string | null, topics: string[] | undefined): boolean {
  const text = (readmeText ?? '').toLowerCase();
  const t = (topics ?? []).map((s) => s.toLowerCase());
  const langList = languages ? Object.keys(languages).map((l) => l.toLowerCase()) : [];

  if (rule.sizeEquals !== undefined && repo.size !== rule.sizeEquals) return false;

  if (rule.topicsContains) {
    for (const tok of rule.topicsContains) if (t.includes(tok.toLowerCase())) return true;
  }
  if (rule.readmeContains) {
    for (const pat of rule.readmeContains) if (text.includes(pat.toLowerCase())) return true;
  }
  if (rule.languagesContains) {
    for (const l of rule.languagesContains) if (langList.includes(l.toLowerCase())) return true;
  }
  if (rule.nameContains) {
    for (const n of rule.nameContains) if ((repo.name ?? '').toLowerCase().includes(n.toLowerCase())) return true;
  }
  return false;
}

export async function scoreCategory(repo: any, languages: Record<string, number> | null, readmeText: string | null, topics: string[] | undefined, providedRules?: Rule[]): Promise<{ category: string; confidence: number }> {
  const rs = providedRules ?? (await loadRules());
  for (const r of rs) {
    if (matchesRule(r, repo, languages, readmeText, topics)) return { category: r.category, confidence: r.confidence };
  }
  const langList = languages ? Object.keys(languages).map((l) => l.toLowerCase()) : [];
  if (langList.length > 0) return { category: langList[0], confidence: 0.5 };
  return { category: 'other', confidence: 0.3 };
}

export const bundledRules = rules as Rule[];

export default { loadRules, matchesRule, scoreCategory, bundledRules };
