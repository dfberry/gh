import fetch from 'node-fetch';
import readline from 'readline/promises';
import { loadEnv, headers, fmtSize } from './utils';

loadEnv();
const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN not found'); process.exit(2); }

async function listOwnedRepos() {
  const out: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/user/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Failed to list repos: ${res.status}`);
    const data = await res.json();
    out.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return out;
}

async function hasCommits(owner: string, repo: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 409) return false; // empty repo
  if (!res.ok) return true;
  const j = await res.json();
  return Array.isArray(j) && j.length > 0;
}

async function hasPRs(owner: string, repo: string) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=1`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return true;
  const j = await res.json();
  return Array.isArray(j) && j.length > 0;
}

async function deleteRepo(owner:string, repo:string) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { method: 'DELETE', headers: headers(token) });
  if (res.status === 204) return true;
  const txt = await res.text();
  throw new Error(`Delete failed: ${res.status} ${txt}`);
}

async function main() {
  const repos = await listOwnedRepos();
  const candidates = repos.filter(r => r && r.size === 0 && !r.archived && r.owner && r.owner.type === 'User');
  const empty: any[] = [];
  for (const r of candidates) {
    const owner = r.owner.login;
    const name = r.name;
    if (await hasCommits(owner, name)) continue;
    if (await hasPRs(owner, name)) continue;
    empty.push(r);
  }
  console.log(`Found ${empty.length} empty repo(s):`);
  for (const r of empty) console.log(`- ${r.full_name} (size: ${fmtSize(r.size)})`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question('Dry-run only. Type DELETE to remove these repos: ');
  rl.close();
  if (ans !== 'DELETE') { console.log('Abort'); return; }
  for (const r of empty) {
    try {
      await deleteRepo(r.owner.login, r.name);
      console.log('Deleted', r.full_name);
    } catch (err) {
      console.error('Error deleting', r.full_name, err.message || err);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
