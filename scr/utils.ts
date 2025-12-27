import fs from 'fs';
import path from 'path';

export function loadEnv(file?: string) {
  let f = file;
  if (!f) {
    const repoRoot = path.join(process.cwd(), '.env');
    if (fs.existsSync(repoRoot)) f = repoRoot;
  }
  if (!f) return;
  if (!fs.existsSync(f)) return;
  const content = fs.readFileSync(f, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const val = line.slice(idx + 1);
    process.env[key] = val;
  }
}

export function getToken(): string {
  return process.env.GH_TOKEN || '';
}

export function headers(token?: string) {
  const t = token || getToken();
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'scr-tools',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export function fmtSize(kb: number | undefined) {
  if (typeof kb !== 'number') return 'unknown';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}
