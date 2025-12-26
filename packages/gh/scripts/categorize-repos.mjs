#!/usr/bin/env node
// scripts/categorize-repos.mjs
// Reads a list of repos (JSON or plain list) and categorizes them using heuristics.
// Usage:
//  node ./scripts/categorize-repos.mjs --input=stale.json --output=json --fetch
// Flags:
//  --input=PATH    JSON input file (defaults to examples/stale.json or stale.json)
//  --fetch         Fetch repo metadata from GitHub (requires GH_TOKEN in env or examples/.env)
//  --dry-run       Do not perform any writes (default)
//  --output=json|csv  Output format (json default)

import fs from 'fs';
import path from 'path';
import { categorize } from '../src/categorizer.mjs';
import { spawnSync } from 'child_process';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkGraphQLRateLimit(token) {
  if (!token) return null;
  try {
    const endpoint = 'https://api.github.com/graphql';
    const q = `query { rateLimit { limit cost remaining resetAt } }`;
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    if (!res.ok) return null;
    const j = await res.json();
    const rl = j && j.data && j.data.rateLimit;
    if (!rl) return null;
    const out = { limit: rl.limit, cost: rl.cost, remaining: rl.remaining, resetAt: rl.resetAt };
    if (process.env.GH_VERBOSE) console.error('GraphQL rateLimit:', out);
    return out;
  } catch (err) {
    return null;
  }
}

const argv = process.argv.slice(2);
const inputArg = argv.find(a => a.startsWith('--input='))?.split('=')[1] || null;
const fetchMeta = argv.includes('--fetch');
const verbose = argv.includes('--verbose');
if (verbose) process.env.GH_VERBOSE = '1';
const checksArg = (() => argv.find(a => a.startsWith('--checks='))?.split('=')[1])() || 'light';
const checks = (checksArg === 'full') ? 'full' : 'light';
const dryRun = argv.includes('--dry-run');
const outputArg = (() => argv.find(a => a.startsWith('--output='))?.split('=')[1])() || 'json';

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

// Try conventional env path
loadEnv(path.join(process.cwd(), 'examples', '.env'));

async function readInput(file) {
  if (!file) {
    const candidates = [path.join(process.cwd(), 'stale.json'), path.join(process.cwd(), 'examples', 'stale.json'), path.join(process.cwd(), '..', 'npm_packages', 'gh', 'stale.json')];
    for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
    // fallback to stdin
    const stat = fs.fstatSync(0);
    if (stat && stat.isFIFO()) {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error('No input file provided and no stale.json found');
  }
  return fs.readFileSync(file, 'utf8');
}

function parsePossiblyJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    // fall back to parse lines like '- owner/repo (updated: ... )'
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const l of lines) {
      // look for owner/name
      const m = l.match(/([\w-]+\/[^\s()]+)/);
      if (m) items.push({ full_name: m[1] });
    }
    return { items };
  }
}

async function fetchRepo(fullName) {
  // fallback single-repo REST fetch (used when full checks require README)
  const token = process.env.GH_TOKEN;
  if (!token) return null;
  const url = `https://api.github.com/repos/${fullName}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gh-sdk-categorizer' } });
  if (!res.ok) {
    // if rate limited, inspect headers and wait if possible
    const rem = res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining');
    const reset = res.headers && res.headers.get && res.headers.get('x-ratelimit-reset');
    if (process.env.GH_VERBOSE) {
      console.error('REST fetch failed', { status: res.status, remaining: rem, reset });
    }
    if (rem !== null && rem !== undefined && Number(rem) <= 0 && reset) {
      const waitSec = Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) + 3;
      console.warn(`Rate limit hit for REST: waiting ${waitSec}s before retrying`);
      await sleep(waitSec * 1000);
      return fetchRepo(fullName);
    }
    return null;
  }
  const j = await res.json();
  const langsRes = await fetch(`${url}/languages`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  const langs = langsRes.ok ? await langsRes.json() : {};
  const topics = j.topics || [];
  // try to get README when doing full checks
  let readme_snippet = null;
  const readmeRes = await fetch(`${url}/readme`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' } });
  if (readmeRes.ok) {
    const txt = await readmeRes.text();
    readme_snippet = txt.slice(0, 2000);
  }
  // inspect headers for remaining quota and delay a little if low
  try {
    const remaining = res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining');
    const resetAt = res.headers && res.headers.get && res.headers.get('x-ratelimit-reset');
    if (process.env.GH_VERBOSE) console.error('REST headers', { remaining, resetAt });
    if (remaining !== null && remaining !== undefined && Number(remaining) <= 5 && resetAt) {
      const waitSec = Math.max(0, Number(resetAt) - Math.floor(Date.now() / 1000)) + 2;
      console.warn(`Low REST quota (${remaining}). Sleeping ${waitSec}s to avoid hitting limit.`);
      await sleep(waitSec * 1000);
    }
  } catch (err) {
    // ignore header parse errors
  }
  return {
    full_name: j.full_name,
    name: j.name,
    owner: j.owner?.login,
    description: j.description,
    primary_language: j.language,
    topics,
    languages: langs,
    updated_at: j.updated_at,
    readme_snippet
  };
}

async function fetchMetaBatch(fullNames) {
  // Use GitHub GraphQL to fetch multiple repositories in one request (light checks)
  const token = process.env.GH_TOKEN;
  if (!token) return {};
  const endpoint = 'https://api.github.com/graphql';
  const queries = [];
  const aliasMap = {};
  fullNames.forEach((full, i) => {
    const [owner, name] = full.split('/');
    const alias = `r${i}`;
    aliasMap[alias] = full;
    // request description, primaryLanguage, languages (first 10), repositoryTopics
    queries.push(`${alias}: repository(owner: \"${owner}\", name: \"${name}\") { fullName: nameWithOwner description primaryLanguage { name } languages(first: 10) { edges { size node { name } } } repositoryTopics(first:10) { nodes { topic { name } } } }`);
  });
  const fullQuery = `query { ${queries.join('\n')} }`;
  // check rate limit before executing batch
  try {
    const rl = await checkGraphQLRateLimit(token);
    if (rl && typeof rl.remaining === 'number') {
      const threshold = Math.max(50, fullNames.length * 2);
      if (rl.remaining < threshold) {
        const resetAt = rl.resetAt ? Math.floor(new Date(rl.resetAt).getTime() / 1000) : null;
        if (resetAt) {
          const waitSec = Math.max(0, resetAt - Math.floor(Date.now() / 1000)) + 2;
          console.warn(`GraphQL remaining ${rl.remaining} < ${threshold}. Sleeping ${waitSec}s until reset.`);
          await sleep(waitSec * 1000);
        } else {
          // small backoff
          console.warn(`GraphQL remaining ${rl.remaining} is low. Backing off 5s.`);
          await sleep(5000);
        }
      }
    }
  } catch (err) {
    // ignore
  }

  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: fullQuery }) });
  if (!res.ok) {
    // if rate limited, try to parse reset header or fallback to backoff
    try {
      const jsonErr = await res.text();
      console.warn('GraphQL batch request failed:', res.status, jsonErr.slice(0, 400));
    } catch (e) {}
    return {};
  }
  const json = await res.json();
  const out = {};
  for (const alias of Object.keys(aliasMap)) {
    const full = aliasMap[alias];
    const node = json.data && json.data[alias];
    if (!node) continue;
    const langs = {};
    if (node.languages && node.languages.edges) {
      for (const e of node.languages.edges) {
        if (e && e.node && e.node.name) langs[e.node.name] = e.size || 0;
      }
    }
    const topics = [];
    if (node.repositoryTopics && node.repositoryTopics.nodes) {
      for (const n of node.repositoryTopics.nodes) {
        if (n && n.topic && n.topic.name) topics.push(n.topic.name);
      }
    }
    out[full] = {
      full_name: node.fullName || full,
      name: full.split('/')[1],
      owner: full.split('/')[0],
      description: node.description || null,
      primary_language: node.primaryLanguage?.name || null,
      topics,
      languages: langs
    };
  }
  // small polite pause between batches
  await sleep(300);
  return out;
}

async function main() {
  const text = await readInput(inputArg);
  const parsed = parsePossiblyJson(text);
  // support various shapes: { items: [...] } or array
  let items = [];
  if (Array.isArray(parsed)) items = parsed.map(p => (typeof p === 'string' ? { full_name: p } : p));
  else if (parsed.items) items = parsed.items;
  else items = typeof parsed === 'object' ? [parsed] : [];

  const results = [];

  // If fetching meta in light mode, batch GraphQL requests
  let batchMeta = {};
  if (fetchMeta && checks === 'light') {
    const fullNames = items.map(it => it.full_name || it.fullName || (it.owner && it.name ? `${it.owner}/${it.name}` : null)).filter(Boolean);
    const BATCH = 15;
    for (let i=0;i<fullNames.length;i+=BATCH) {
      const slice = fullNames.slice(i,i+BATCH);
      const r = await fetchMetaBatch(slice).catch(() => ({}));
      batchMeta = { ...batchMeta, ...r };
    }
  }

  for (const it of items) {
    const full = it.full_name || it.fullName || (it.owner && it.name ? `${it.owner}/${it.name}` : null);
    if (!full) continue;
    let meta = { full_name: full, name: full.split('/')[1], owner: full.split('/')[0], description: it.description || null };
    if (fetchMeta) {
      if (checks === 'light' && batchMeta[full]) {
        meta = { ...meta, ...batchMeta[full] };
      } else {
        const fetched = await fetchRepo(full).catch(() => null);
        if (fetched) meta = { ...meta, ...fetched };
      }
    }

    const cat = categorize(meta);
    results.push({ full_name: full, ...meta, categories: cat.categories, primary_category: cat.primary_category, score: cat.score, matched_rules: cat.matched_rules });
  }

  const out = { items: results, metadata: { generated_at: (new Date()).toISOString(), total: results.length } };

  if (outputArg === 'json') {
    console.log(JSON.stringify(out, null, 2));
  } else if (outputArg === 'csv') {
    // try to use json-to-csv helper by piping through it, but do simple CSV here
    const headers = ['full_name','primary_category','score','matched_rules','description'];
    console.log(headers.join(','));
    for (const r of results) {
      const row = [r.full_name, r.primary_category || '', r.score || '', JSON.stringify(r.matched_rules || []), `"${(r.description||'').replace(/"/g,'""')}"`];
      console.log(row.join(','));
    }
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
