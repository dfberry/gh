// simple categorizer module
// Exports: categorize(metadata) -> { categories: [], primary_category, score, matched_rules }

const NAME_RULES = [
  { name: 'azure', regex: /\b(azure|az|az-)/i, score: 0.9, category: 'azure' },
  { name: 'actions', regex: /actions|workflow|workflow(s)?|gh-?action(s)?|github-action/i, score: 0.9, category: 'actions' },
  { name: 'gh', regex: /\bgh\b|github|gh-/, score: 0.9, category: 'gh' },
  { name: 'terraform', regex: /terraform|hcl|tf-/i, score: 0.85, category: 'infrastructure' },
  { name: 'docker', regex: /dockerfile|docker|container/i, score: 0.8, category: 'containers' },
  { name: 'frontend', regex: /react|next|vite|angular|vue|svelte/i, score: 0.8, category: 'frontend' },
  { name: 'backend', regex: /express|fastify|nest|koa|spring|django|flask/i, score: 0.75, category: 'backend' },
  { name: 'rust', regex: /rust|cargo|axum/i, score: 0.8, category: 'rust' }
];

const TOPIC_MAP = {
  azure: 'azure',
  'azure-functions': 'azure',
  'github-actions': 'actions',
  'github-action': 'actions',
  actions: 'actions',
  terraform: 'infrastructure',
  docker: 'containers',
  react: 'frontend',
  nextjs: 'frontend',
  typescript: 'frontend',
  javascript: 'frontend',
  node: 'backend',
  rust: 'rust'
};

const DESC_KEYWORDS = [
  { k: /azure/i, cat: 'azure', score: 0.6 },
  { k: /azure function|azure-functions|azure function/i, cat: 'azure', score: 0.7 },
  { k: /github action|github-actions|action runner|github action/i, cat: 'actions', score: 0.75 },
  { k: /workflow file|workflow/i, cat: 'actions', score: 0.6 },
  { k: /terraform|hcl/i, cat: 'infrastructure', score: 0.7 },
  { k: /bicep|arm template|arm-template|azure-pipeline/i, cat: 'azure', score: 0.7 },
  { k: /docker|container|dockerfile/i, cat: 'containers', score: 0.6 },
  { k: /react|next.js|nextjs|vite|angular|vue|svelte/i, cat: 'frontend', score: 0.6 },
  { k: /express|fastify|nest|koa|spring|django|flask/i, cat: 'backend', score: 0.6 }
];

function normalizeText(s) { return (s || '').toString(); }

export function categorize(metadata = {}) {
  // metadata expected keys: full_name, name, description, topics (array), primary_language, languages (object)
  const name = normalizeText(metadata.name || metadata.full_name);
  const desc = normalizeText(metadata.description || '');
  const readme = normalizeText(metadata.readme_snippet || '');
  const topics = Array.isArray(metadata.topics) ? metadata.topics : [];

  const scores = {}; // category -> score
  const matched = [];

  // Name rules
  for (const r of NAME_RULES) {
    if (r.regex.test(name) || r.regex.test(metadata.full_name || '')) {
      scores[r.category] = (scores[r.category] || 0) + r.score;
      matched.push(`name:${r.name}`);
    }
  }

  // Topics
  for (const t of topics) {
    const key = String(t).toLowerCase();
    if (TOPIC_MAP[key]) {
      const cat = TOPIC_MAP[key];
      scores[cat] = (scores[cat] || 0) + 0.9;
      matched.push(`topic:${key}`);
    }
  }

  // Description keywords
  for (const k of DESC_KEYWORDS) {
    if (k.k.test(desc)) {
      scores[k.cat] = (scores[k.cat] || 0) + k.score;
      matched.push(`desc:${k.k}`);
    }
    // also check README snippet with slightly higher weight
    if (k.k.test(readme)) {
      scores[k.cat] = (scores[k.cat] || 0) + (k.score * 1.1);
      matched.push(`readme:${k.k}`);
    }
  }

  // Primary language heuristic: small boost
  const lang = (metadata.primary_language || '').toString().toLowerCase();
  if (lang) {
    if (['typescript','javascript','css','html'].includes(lang)) scores['frontend'] = (scores['frontend'] || 0) + 0.4;
    if (['go','java','c#','csharp','python','ruby'].includes(lang)) scores['backend'] = (scores['backend'] || 0) + 0.4;
    if (lang === 'hcl') scores['infrastructure'] = (scores['infrastructure'] || 0) + 0.7;
    if (lang === 'rust') scores['rust'] = (scores['rust'] || 0) + 0.7;
  }

  // Languages map
  if (metadata.languages && typeof metadata.languages === 'object') {
    const keys = Object.keys(metadata.languages).map(k => k.toLowerCase());
    if (keys.includes('hcl')) scores['infrastructure'] = (scores['infrastructure'] || 0) + 0.5;
  }

  // Build ranked categories
  const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  const categories = entries.map(e => e[0]);
  const primary = categories.length ? categories[0] : null;
  const score = entries.length ? Math.min(1, entries[0][1]) : 0;

  return {
    categories,
    primary_category: primary,
    score: Math.round((score + Number.EPSILON) * 100) / 100,
    matched_rules: matched
  };
}

export default { categorize };
