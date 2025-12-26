#!/usr/bin/env node
// scripts/index-all-repos.mjs
// Fetch all repos owned by the authenticated user, write examples/all_repos.json,
// then run the existing categorize-repos.mjs to enrich and produce an index.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function loadEnv(file) {
  if (!file) return;
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    const [k, ...rest] = line.split('=');
    if (!k) continue;
    process.env[k] = rest.join('=');
  }
}

async function fetchAllOwnedRepos() {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN not found in environment');
  const perPage = 100;
  let page = 1;
  let out = [];
  while (true) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&type=owner`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gh-sdk-indexer' } });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to list repos: ${res.status} ${txt.slice(0,300)}`);
    }
    const j = await res.json();
    if (!Array.isArray(j) || j.length === 0) break;
    for (const r of j) {
      out.push({ full_name: r.full_name || `${r.owner?.login}/${r.name}`, name: r.name, owner: r.owner?.login, description: r.description, topics: r.topics || [], size: r.size, updated_at: r.updated_at });
    }
    if (j.length < perPage) break;
    page += 1;
    // be polite
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return out;
}

async function main() {
  // Try conventional env path
  loadEnv(path.join(process.cwd(), 'examples', '.env'));
  const argv = process.argv.slice(2);
  const outDirArg = argv.find(a => a.startsWith('--out-dir='))?.split('=')[1] || null;
  const genDirDefault = path.join(process.cwd(), '..', '..', 'generated');
  const genDir = outDirArg || process.env.GENERATED_DIR || genDirDefault;

  const repos = await fetchAllOwnedRepos();
    try { fs.mkdirSync(genDir, { recursive: true }); } catch (e) {}

    const outPath = path.join(genDir, 'all_repos.json');
    fs.writeFileSync(outPath, JSON.stringify(repos, null, 2), 'utf8');
    console.log(`Wrote ${repos.length} repos to ${outPath}`);

    // Prepare generated output directory
    // Run the categorize script (light checks, fetch meta) and capture JSON output
    const cmd = process.execPath; // node
    const args = ['./scripts/categorize-repos.mjs', `--input=${outPath}`, '--fetch', '--checks=light', '--output=json', '--verbose'];
    console.log('Running categorizer (capturing output):', cmd, args.join(' '));
    const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
    if (r.error) {
      console.error('Failed to run categorizer:', r.error);
      process.exit(1);
    }
    if (r.status !== 0) {
      console.error('Categorizer exited with status', r.status);
      console.error(r.stderr || '');
      process.exit(r.status || 1);
    }

    const stdout = r.stdout || '';
    // attempt to parse JSON from stdout (strip any leading/trailing logs)
    const firstBrace = stdout.indexOf('{');
    const lastBrace = stdout.lastIndexOf('}');
    let jsonText = '';
    if (firstBrace >= 0 && lastBrace >= 0 && lastBrace > firstBrace) {
      jsonText = stdout.slice(firstBrace, lastBrace + 1);
    } else {
      jsonText = stdout;
    }

    const categorizedPathGen = path.join(genDir, 'categorized-index.json');
    try {
      fs.writeFileSync(categorizedPathGen, jsonText, 'utf8');
      console.log(`Wrote categorized index to ${categorizedPathGen}`);
    } catch (err) {
      console.error('Failed to write categorized output:', err);
    }

    // produce a small summary of counts per primary_category
    try {
      const parsed = JSON.parse(jsonText);
      const items = parsed.items || [];
      const counts = {};
      for (const it of items) {
        const pc = it.primary_category || 'uncategorized';
        counts[pc] = (counts[pc] || 0) + 1;
      }
      const summary = { generated_at: (new Date()).toISOString(), total: items.length, counts };
      const summaryPath = path.join(genDir, 'category-summary.json');
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`Wrote summary to ${summaryPath}`);
    } catch (err) {
      console.error('Failed to produce summary:', err);
    }

  
}

main().catch(err => { console.error(err); process.exit(1); });
