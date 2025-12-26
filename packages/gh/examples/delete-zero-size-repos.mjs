#!/usr/bin/env node
// examples/delete-zero-size-repos.mjs
// Deletes all repositories owned by the authenticated user that have size === 0.
// By default this is a dry-run. Pass `--yes` to enable deletions and either
// confirm by typing `delete` at the prompt or pass `--force` to skip the prompt.

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const argv = process.argv.slice(2);
const envFileArg = argv.find(a => a.startsWith('--env-file=')) || null;
const envFile = envFileArg ? envFileArg.split('=')[1] : path.join(process.cwd(), 'examples', '.env');
const doIt = argv.includes('--yes');
const force = argv.includes('--force');
const dryRun = argv.includes('--dry-run');
const outputArg = (() => {
  const o = argv.find(a => a.startsWith('--output='));
  if (o) return o.split('=')[1];
  return null;
})();
const outputJson = outputArg === 'json';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    const [k, ...rest] = line.split('=');
    if (!k) continue;
    const v = rest.join('=');
    process.env[k] = v;
  }
}

loadEnv(envFile);

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('No GH_TOKEN found in environment. Provide it via --env-file or export GH_TOKEN.');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'gh-sdk-examples'
};

function parseLinkHeader(h) {
  if (!h) return {};
  const parts = h.split(',').map(p => p.trim());
  const links = {};
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) links[m[2]] = m[1];
  }
  return links;
}

async function listAllUserRepos() {
  const per_page = 100;
  let url = `https://api.github.com/user/repos?type=owner&per_page=${per_page}`;
  const all = [];
  while (url) {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Failed to fetch repos: ${r.status} ${r.statusText}`);
    const page = await r.json();
    all.push(...page);
    const link = r.headers.get('link');
    const links = parseLinkHeader(link);
    url = links.next;
  }
  return all;
}

async function deleteRepo(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (res.status === 204) return true;
  const body = await res.text();
  throw new Error(`Failed to delete ${owner}/${repo}: ${res.status} ${res.statusText} - ${body}`);
}

function fmtSize(kb) {
  if (typeof kb !== 'number') return 'unknown';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

async function promptConfirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('Listing all owned repositories and filtering those with size === 0...');
  const repos = await listAllUserRepos();
  const zero = repos.filter(r => r && r.owner && r.size === 0 && !r.archived && r.owner.type === 'User');

  if (zero.length === 0) {
    console.log('No zero-size repositories found.');
    return;
  }

  const zeroList = zero.map(r => ({ full_name: r.full_name, updated_at: r.updated_at, size_kb: r.size }));

  if (outputJson && (!doIt || dryRun)) {
    console.log(JSON.stringify({ zero: zeroList }, null, 2));
    return;
  }

  console.log(`Found ${zero.length} zero-size repo(s):`);
  for (const r of zero) console.log(`- ${r.full_name} (updated: ${r.updated_at}) - size: ${fmtSize(r.size)}`);

  if (!doIt || dryRun) {
    console.log('\nThis is a dry run. No repositories will be deleted.');
    console.log('Run with `--yes` to actually delete the zero-size repositories (and consider `--force` to skip interactive prompt).');
    return;
  }

  const actions = [];
  if (!force) {
    const ans = await promptConfirm('\nThis will DELETE the repositories listed above (irreversible). Type `delete` to continue: ');
    if (ans.trim().toLowerCase() !== 'delete') {
      console.log('Abort: deletion confirmation not provided. No repositories were deleted.');
      console.log('To force deletion non-interactively use `--force` (careful!).');
      return;
    }
  } else {
    console.log('--force provided: proceeding to delete without interactive confirmation.');
  }

  for (const r of zero) {
    try {
      await deleteRepo(r.owner.login, r.name);
      console.log(`Deleted ${r.full_name}`);
      actions.push({ action: 'delete', repo: r.full_name, status: 'ok' });
    } catch (err) {
      console.error(`Error deleting ${r.full_name}:`, err.message || err);
      actions.push({ action: 'delete', repo: r.full_name, status: 'error', error: String(err) });
    }
  }

  if (outputJson) {
    console.log(JSON.stringify({ zero: zeroList, actions }, null, 2));
  } else {
    console.log('Done.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
