import * as fs from 'fs/promises';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { createGitHubClient, security } from 'github-rest';
import { formatJsonOutput, emitOutput } from '../lib/report.js';

export type Args = BaseFlags & { inputFlags: string[] };

export function parseArgs(argv: string[]): Args {
  const flags = argv.slice(0);
  const base = parseBaseFlags(flags);
  const cfg: Args = { ...base, inputFlags: [] } as any;
  for (const a of flags) {
    if (a.startsWith('--input=')) cfg.inputFlags.push(a.split('=')[1]);
    if (a.startsWith('--repos=')) cfg.inputFlags.push(...a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  return cfg;
}

async function loadEntries(inputFlags: string[]) {
  const entries: string[] = [];
  for (const inputPath of inputFlags) {
    const fileContent = await fs.readFile(inputPath, 'utf8');
    let parsed: any;
    try { parsed = JSON.parse(fileContent); } catch { parsed = fileContent; }
    if (typeof parsed === 'string') entries.push(parsed);
    else if (Array.isArray(parsed)) {
      for (const it of parsed) {
        if (typeof it === 'string') entries.push(it);
        else if (it && typeof it === 'object') {
          if (it.full_name) entries.push(it.full_name);
          else if (it.owner && it.name) entries.push(`${it.owner}/${it.name}`);
          else if (it.repo) entries.push(it.repo);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const arr = parsed.repos || parsed.items || parsed.repositories;
      if (Array.isArray(arr)) {
        for (const it of arr) {
          if (typeof it === 'string') entries.push(it);
          else if (it && typeof it === 'object') {
            if (it.full_name) entries.push(it.full_name);
            else if (it.owner && it.name) entries.push(`${it.owner}/${it.name}`);
            else if (it.repo) entries.push(it.repo);
          }
        }
      }
    }
  }
  return entries.map((s) => s.trim()).filter(Boolean);
}

export async function runCommand(client: any, args: Args) {
  const inputFlags = args.inputFlags || [];
  if (inputFlags.length === 0) throw new Error('Missing required flag --input=path.json or --repos=owner/repo');
  const entries = await loadEntries(inputFlags);
  const results: any[] = [];
  for (const r of entries) {
    const parts = r.split('/');
    if (parts.length < 2) continue;
    const owner = parts[0];
    const repo = parts[1];
    try {
      const cfg = await security.getRepoSecurityConfig(client, owner, repo);
      results.push({ owner, repo, config: cfg });
    } catch (err) {
      results.push({ owner, repo, error: (err as any)?.message || String(err) });
    }
  }
  return { results };
}

export async function activeSecurityCommand(argv: string[]) {
  const args = parseArgs(argv);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const client = createGitHubClient({ token: token as string | undefined });
  const res = await runCommand(client as any, args);
  const out = args.out || args.out;
  await emitOutput(formatJsonOutput(res.results), out || undefined);
}

export default activeSecurityCommand;
