#!/usr/bin/env node
// examples/archive-stale-repos.mjs
// Finds repositories owned by the authenticated user that haven't been
// updated in a year and archives them. Dry-run by default. Use `--yes`
// to actually perform the archiving. Supports `--env-file=path` to load
// a token (same convention as other examples).

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const argv = process.argv.slice(2);
const envFileArg = argv.find(a => a.startsWith('--env-file=')) || null;
const envFile = envFileArg ? envFileArg.split('=')[1] : path.join(process.cwd(), 'examples', '.env');
const doIt = argv.includes('--yes');
const deleteEmpty = argv.includes('--delete-empty') || argv.includes('--delete-zero-size');
const force = argv.includes('--force');
const dryRun = argv.includes('--dry-run');
const outputArg = (() => {
  const o = argv.find(a => a.startsWith('--output='));
  if (o) return o.split('=')[1];
  return null;
})();
const outDirArg = argv.find(a => a.startsWith('--out-dir='))?.split('=')[1] || null;
const outputJson = outputArg === 'json';
const daysArg = (() => {
  const m = argv.find(a => a.startsWith('--older-than-days='));
  if (m) return parseInt(m.split('=')[1], 10) || 365;
  return 365;
})();

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

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { headers, ...opts });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${body}`);
  }
  return { res, json: await res.json() };
}

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

async function promptConfirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, ans => { rl.close(); resolve(ans); });
  });
}

async function archiveRepo(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to archive ${owner}/${repo}: ${res.status} ${res.statusText} - ${body}`);
  }
  return await res.json();
}

async function deleteRepo(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  // GitHub returns 204 No Content on success
  if (res.status === 204) return true;
  const body = await res.text();
  throw new Error(`Failed to delete ${owner}/${repo}: ${res.status} ${res.statusText} - ${body}`);
}

async function main() {
  console.log(`Loading repos (owned) and listing those not updated in the last ${daysArg} days...`);

  // whoami
  const { json: me } = await fetchJson('https://api.github.com/user');
  const username = me.login;

  const repos = await listAllUserRepos();
  const cutoff = new Date(Date.now() - daysArg * 24 * 60 * 60 * 1000);

  const stale = repos.filter(r => {
    if (r.archived) return false;
    if (!r.owner || r.owner.login !== username) return false;
    const updated = new Date(r.updated_at);
    return updated < cutoff;
  });

  if (stale.length === 0) {
    console.log('No stale repositories found. Nothing to do.');
    return;
  }

  function fmtSizeKB(kb) {
    if (typeof kb !== 'number') return 'unknown';
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb} KB`;
  }

  // Prepare JSON-friendly lists
  const staleList = stale.map(r => ({ full_name: r.full_name, updated_at: r.updated_at, size_kb: r.size }));
  const zeroSizeList = stale.filter(r => r.size === 0).map(r => ({ full_name: r.full_name, updated_at: r.updated_at, size_kb: r.size }));

  if (outputJson && (!doIt || dryRun)) {
    const genDirDefault = path.join(process.cwd(), '..', '..', 'generated');
    const genDir = outDirArg || process.env.GENERATED_DIR || genDirDefault;
    if (outDirArg || process.env.GENERATED_DIR) {
      try { fs.mkdirSync(genDir, { recursive: true }); } catch (e) {}
      const outPath = path.join(genDir, 'stale.json');
      fs.writeFileSync(outPath, JSON.stringify({ stale: staleList, zeroSize: zeroSizeList }, null, 2), 'utf8');
      console.log(`Wrote ${staleList.length} stale repos to ${outPath}`);
      return;
    }
    console.log(JSON.stringify({ stale: staleList, zeroSize: zeroSizeList }, null, 2));
    return;
  }

  if (outputJson) {
    // emit listing first (machine-readable), then continue to perform actions
    // actions will be emitted as JSON at the end
  } else {
    console.log(`Found ${stale.length} stale repo(s):`);
    for (const r of stale) console.log(`- ${r.full_name} (updated: ${r.updated_at}) - size: ${fmtSizeKB(r.size)}`);
  }

  if (!doIt || dryRun) {
    console.log('\nThis is a dry run. No repositories were archived or deleted.');
    console.log('Run with `--yes` to actually archive them (or use the gh prepare script to create an env-file).');
    if (deleteEmpty) console.log('Use `--delete-empty` (with `--yes`) to delete zero-size repos.');
    return;
  }

  // interactive confirmation
  const answer = await promptConfirm('\nThis will archive the repositories listed above. Type `yes` to continue: ');
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted. No changes made.');
    return;
  }

  // Archive non-zero-size stale repos
  const actions = [];
  for (const r of stale) {
    try {
      // If deleteEmpty is set and repo size is 0, skip archiving (deletion handled below)
      if (deleteEmpty && r.size === 0) continue;
      const res = await archiveRepo(r.owner.login, r.name);
      console.log(`Archived ${r.full_name}`);
      actions.push({ action: 'archive', repo: r.full_name, status: 'ok' });
    } catch (err) {
      console.error(`Error archiving ${r.full_name}:`, err.message || err);
      actions.push({ action: 'archive', repo: r.full_name, status: 'error', error: String(err) });
    }
  }

  // Handle deletion of zero-size repos if requested
  if (deleteEmpty) {
    const zeroSize = stale.filter(r => r.size === 0);
    if (zeroSize.length === 0) {
      console.log('No zero-size repositories to delete.');
    } else {
      console.log(`\nFound ${zeroSize.length} zero-size repo(s) matching filter:`);
      for (const r of zeroSize) console.log(`- ${r.full_name} (updated: ${r.updated_at}) - size: ${fmtSizeKB(r.size)}`);

      if (!force) {
        const ans = await promptConfirm('\nThis will DELETE the repositories listed above (irreversible). Type `delete` to continue: ');
        if (ans.trim().toLowerCase() !== 'delete') {
          console.log('Abort: deletion confirmation not provided. No repositories were deleted.');
          console.log('To force deletion non-interactively use `--force` (careful!).');
          return;
        }
      } else {
        console.log('\n--force provided: proceeding to delete zero-size repos without interactive confirmation.');
      }

      for (const r of zeroSize) {
        try {
          await deleteRepo(r.owner.login, r.name);
          console.log(`Deleted ${r.full_name}`);
          actions.push({ action: 'delete', repo: r.full_name, status: 'ok' });
        } catch (err) {
          console.error(`Error deleting ${r.full_name}:`, err.message || err);
          actions.push({ action: 'delete', repo: r.full_name, status: 'error', error: String(err) });
        }
      }
    }
  }
  if (outputJson) {
    const genDirDefault = path.join(process.cwd(), '..', '..', 'generated');
    const genDir = outDirArg || process.env.GENERATED_DIR || genDirDefault;
    if (outDirArg || process.env.GENERATED_DIR) {
      try { fs.mkdirSync(genDir, { recursive: true }); } catch (e) {}
      const outPath = path.join(genDir, 'stale.json');
      fs.writeFileSync(outPath, JSON.stringify({ stale: staleList, zeroSize: zeroSizeList, actions }, null, 2), 'utf8');
      console.log(`Wrote ${staleList.length} stale repos + actions to ${outPath}`);
    } else {
      console.log(JSON.stringify({ stale: staleList, zeroSize: zeroSizeList, actions }, null, 2));
    }
  } else {
    console.log('Done.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
