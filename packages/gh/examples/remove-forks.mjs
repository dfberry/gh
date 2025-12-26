#!/usr/bin/env node
// examples/remove-forks.mjs
// Finds forked repositories for a user or org and optionally deletes them.
// Usage:
//   GH_TOKEN=xxxxx node examples/remove-forks.mjs            # dry-run (no deletes)
//   GH_TOKEN=xxxxx node examples/remove-forks.mjs --yes     # actually delete
//   GH_TOKEN=xxxxx node examples/remove-forks.mjs --org=my-org --yes

import readline from 'readline';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.startsWith('--') ? a.slice(2).split('=') : [a, undefined];
  return [k, v ?? true];
}));

// If an env-file is provided, load its key=value pairs into process.env
if (argv['env-file'] || argv.env_file || argv.envfile) {
  const envPath = argv['env-file'] || argv.env_file || argv.envfile;
  try {
    const fs = await import('fs');
    const content = fs.readFileSync(envPath, { encoding: 'utf8' });
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx);
      const val = trimmed.slice(idx + 1);
      // remove optional surrounding quotes
      process.env[key] = val.replace(/^\"|\"$/g, '').replace(/^\'|\'$/g, '');
    }
    console.log(`Loaded env from ${envPath}`);
  } catch (err) {
    console.warn(`Failed to load env-file ${envPath}: ${err.message || err}`);
  }
}

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('Please set GH_TOKEN in environment to run this script.');
  process.exit(2);
}

const isYes = !!argv.yes;
const org = argv.org || argv.o || null;
const perPage = Number(argv.per_page || argv.perpage || 100);
const maxPages = Number(argv.maxPages || argv.max_pages || 50);

function parseLinkHeader(link) {
  const map = {};
  if (!link) return map;
  const parts = link.split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) map[m[2]] = m[1];
  }
  return map;
}

async function fetchWithAuth(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gh-sdk-examples',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const headers = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { data, headers };
}

async function listReposForOrg(orgName) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/orgs/${encodeURIComponent(orgName)}/repos?per_page=${perPage}&page=${page}`;
    const { data, headers } = await fetchWithAuth(url);
    out.push(...data);
    const links = parseLinkHeader(headers.link || null);
    if (!links.next) break;
  }
  return out;
}

async function listReposForUser() {
  // authenticated user's repos
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}`;
    const { data, headers } = await fetchWithAuth(url);
    out.push(...data);
    const links = parseLinkHeader(headers.link || null);
    if (!links.next) break;
  }
  return out;
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (ans) => { rl.close(); resolve(ans); }));
}

async function deleteRepo(owner, repo) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'gh-sdk-examples', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (res.status === 204) return true;
  const txt = await res.text();
  throw new Error(`Failed to delete ${owner}/${repo}: ${res.status} ${txt}`);
}

async function main() {
  console.log('remove-forks example — dry-run by default');
  console.log('Target:', org ? `org ${org}` : 'authenticated user');
  const repos = org ? await listReposForOrg(org) : await listReposForUser();
  const forks = repos.filter((r) => r.fork === true);
  if (forks.length === 0) {
    console.log('No forks found.');
    return;
  }
  console.log(`Found ${forks.length} forked repositories:`);
  for (const r of forks) console.log(`- ${r.full_name}`);

  if (!isYes) {
    console.log('\nThis is a dry run. No repositories were deleted.');
    console.log('To actually delete these repos run with --yes');
    return;
  }

  // Confirm interactively unless --yes was provided explicitly as the only flag
  const answer = await confirm('Really delete all listed forks? Type YES to proceed: ');
  if (answer.trim() !== 'YES') {
    console.log('Aborting. No repositories were deleted.');
    return;
  }

  for (const r of forks) {
    const owner = r.owner?.login ?? r.full_name.split('/')[0];
    const name = r.name;
    try {
      console.log(`Deleting ${owner}/${name} ...`);
      await deleteRepo(owner, name);
      console.log('Deleted.');
    } catch (err) {
      console.error('Error deleting', r.full_name, err.message || err);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
