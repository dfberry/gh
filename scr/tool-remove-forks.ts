import fetch from 'node-fetch';
import readline from 'readline/promises';
import { loadEnv, headers } from './utils';

loadEnv();
const token = process.env.GH_TOKEN;
if (!token) { console.error('GH_TOKEN not found'); process.exit(2); }

async function listOwnedForks() {
  const out: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/user/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Failed to list repos: ${res.status}`);
    const data = await res.json();
    out.push(...data.filter((r: any) => r.fork));
    if (data.length < 100) break;
    page++;
  }
  return out;
}

async function deleteRepo(fullName: string) {
  const [owner, name] = fullName.split('/');
  const url = `https://api.github.com/repos/${owner}/${name}`;
  const res = await fetch(url, { method: 'DELETE', headers: headers(token) });
  if (res.status === 204) return true;
  const txt = await res.text();
  throw new Error(`Delete failed: ${res.status} ${txt}`);
}

async function main() {
  const forks = await listOwnedForks();
  console.log(`Found ${forks.length} owned fork(s)`);
  for (const f of forks) console.log(`- ${f.full_name}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question('Dry-run only. Type YES to delete all owned forks: ');
  rl.close();
  if (ans !== 'YES') { console.log('Abort'); return; }
  for (const f of forks) {
    try {
      console.log('Deleting', f.full_name);
      await deleteRepo(f.full_name);
      console.log('Deleted', f.full_name);
    } catch (err) {
      console.error('Error deleting', f.full_name, err.message || err);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
