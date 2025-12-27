import fetch from 'node-fetch';
import { loadEnv, headers } from './utils';

loadEnv();
const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN not found'); process.exit(2); }

async function listOwnedActive() {
  const out: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/user/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Failed to list repos: ${res.status}`);
    const data = await res.json();
    out.push(...data.filter((r: any) => !r.archived && !r.fork && !r.template));
    if (data.length < 100) break;
    page++;
  }
  return out;
}

async function main() {
  const repos = await listOwnedActive();
  console.log(`Active owned repos: ${repos.length}`);
  console.log(JSON.stringify({ count: repos.length, repos: repos.map(r => r.full_name) }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
