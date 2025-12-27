import fetch from 'node-fetch';
import { loadEnv, headers } from './utils';

loadEnv();
const token = process.env.GH_TOKEN;
if (!token) {
  console.error('GH_TOKEN not found in .env or env');
  process.exit(2);
}

async function listOwnedForks() {
  const out: Array<any> = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/user/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Failed to list repos: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data.filter((r: any) => r.fork));
    if (data.length < 100) break;
    page++;
  }
  return out;
}

async function main() {
  const forks = await listOwnedForks();
  let deletable = 0;
  for (const f of forks) {
    const url = `https://api.github.com/repos/${f.full_name}`;
    const r = await fetch(url, { headers: headers(token) });
    const j = await r.json();
    const admin = !!(j.permissions && j.permissions.admin);
    console.log(`${f.full_name} — admin: ${admin}`);
    if (admin) deletable++;
  }
  console.log(`\nOwned forks found: ${forks.length} — deletable: ${deletable}`);
}

main().catch(err => { console.error(err); process.exit(1); });
