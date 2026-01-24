/**
 * Command: describe-repos
 *
 * Purpose:
 *   Batch-run LLM descriptions for a list of repositories and optionally apply them.
 *
 * Flags:
 *   - `--input=FILE` or `--repos=...`, `--out=`, `--apply`, prompt/LLM flags
 *   - common base flags via `parseBaseFlags()` (e.g. `--debug`, `--debug-dir`)
 *
 * Exports:
 *   - `parseArgs(argv)`, `runCommand(client, args)`, `writeOutput(result, args)`
 *   - `describeReposCommand(argv)` — thin CLI wrapper used by the bin
 *
 * Notes:
 *   Keep this header updated when flags or behavior change; update Markdown docs accordingly.
 */
import type { GitHubClient } from 'github-rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { LLMConfig } from 'llm-completion';
import { repos } from 'github-rest';
import { describeRepoWithLLM, createClient, buildPromptString } from '../lib/describe-common.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

export type Args = BaseFlags & {
  outPath?: string;
  promptFlag?: string;
  inputFlags: string[];
  apply: boolean;
  overwriteDescription: boolean;
  overwriteTopics: boolean;
  openaiKey?: string;
  openaiModel?: string;
  openaiTemp?: number;
  openaiEndpoint?: string;
};

export function parseArgs(argv: string[]): Args {
  const flags = argv.slice(0);
  const base = parseBaseFlags(flags);
  const cfg: Args = { ...base, outPath: undefined, promptFlag: undefined, inputFlags: [], apply: flags.includes('--apply'), overwriteDescription: false, overwriteTopics: false } as any;
  for (const a of flags) {
    if (a.startsWith('--openai-key=')) cfg.openaiKey = a.split('=')[1];
    if (a.startsWith('--openai-model=')) cfg.openaiModel = a.split('=')[1];
    if (a.startsWith('--openai-temp=')) cfg.openaiTemp = Number(a.split('=')[1]);
    if (a.startsWith('--openai-endpoint=')) cfg.openaiEndpoint = a.split('=')[1];
    if (a.startsWith('--out=')) cfg.outPath = a.split('=')[1];
    if (a.startsWith('--prompt=')) cfg.promptFlag = a.split('=')[1];
    if (a.startsWith('--input=')) cfg.inputFlags.push(a.split('=')[1]);
    if (a.startsWith('--repos=')) cfg.inputFlags.push(...a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean));
    if (a === '--overwrite') { cfg.overwriteDescription = true; cfg.overwriteTopics = true; }
    if (a === '--overwrite-description') cfg.overwriteDescription = true;
    if (a === '--overwrite-topics') cfg.overwriteTopics = true;
  }
  return cfg;
}

export async function runCommand(client: GitHubClient, args: Args): Promise<any> {
  const flags = [] as string[]; // legacy uses
  const cfg: LLMConfig = {};
  if (args.openaiKey) cfg.key = args.openaiKey;
  if (args.openaiModel) cfg.model = args.openaiModel;
  if (args.openaiTemp !== undefined) cfg.temperature = args.openaiTemp;
  if (args.openaiEndpoint) cfg.endpoint = args.openaiEndpoint;
  if (args.debug) cfg.debug = { ...(cfg.debug || {}), enabled: true, dir: args.debugDir };

  const inputFlags = args.inputFlags || [];
  const apply = !!args.apply;

  if (inputFlags.length === 0) {
    const safeCfg = Object.assign({}, cfg) as any;
    if (safeCfg.key) safeCfg.key = '[REDACTED]';
    throw new Error('Missing required flag --input=path.json or --repos=path1,path2. Usage: gh-cleanup describe-repos --input=path.json [--apply] [--out=path.json|path.md] [--prompt=path]. Parsed params: ' + JSON.stringify({ apply, outPath: args.outPath, promptFlag: args.promptFlag, cfg: safeCfg }));
  }

  type Entry = { repoStr: string; hasDescription?: boolean; hasTopics?: boolean };
  const entries: Entry[] = [];
  for (const inputPath of inputFlags) {
    const fileContent = await fs.readFile(inputPath, 'utf8');
    let parsedFile: any;
    try {
      parsedFile = JSON.parse(fileContent);
    } catch (e) {
      console.error('Failed to parse input JSON', inputPath);
      throw e;
    }

    if (Array.isArray(parsedFile)) {
      for (const it of parsedFile) {
        if (typeof it === 'string') entries.push({ repoStr: it });
        else if (it && typeof it === 'object') {
          let repoStr: string | undefined;
          if (it.full_name) repoStr = it.full_name;
          else if (it.owner && it.name) repoStr = `${it.owner}/${it.name}`;
          else if (it.repo) repoStr = it.repo;
          else if (it.repository && it.repository.full_name) repoStr = it.repository.full_name;
          else if (it.html_url) {
            const m = it.html_url.match(/github.com\/(.+?)\/?$/);
            if (m) repoStr = m[1];
          }
          if (repoStr) entries.push({ repoStr, hasDescription: Boolean(it.description || it.short_description), hasTopics: Array.isArray(it.topics) && it.topics.length > 0 });
        }
      }
    } else if (parsedFile && typeof parsedFile === 'object') {
      const arr = parsedFile.repos || parsedFile.items || parsedFile.repositories;
      if (Array.isArray(arr)) {
        for (const it of arr) {
          if (typeof it === 'string') entries.push({ repoStr: it });
          else if (it && typeof it === 'object') {
            let repoStr: string | undefined;
            if (it.full_name) repoStr = it.full_name;
            else if (it.owner && it.name) repoStr = `${it.owner}/${it.name}`;
            else if (it.repo) repoStr = it.repo;
            else if (it.repository && it.repository.full_name) repoStr = it.repository.full_name;
            else if (it.html_url) {
              const m = it.html_url.match(/github.com\/(.+?)\/?$/);
              if (m) repoStr = m[1];
            }
            if (repoStr) entries.push({ repoStr, hasDescription: Boolean(it.description || it.short_description), hasTopics: Array.isArray(it.topics) && it.topics.length > 0 });
          }
        }
      }
    }
  }

  const results: any[] = [];
  const overwrite = args.overwriteDescription && args.overwriteTopics;
  const overwriteDescription = args.overwriteDescription || overwrite;
  const overwriteTopics = args.overwriteTopics || overwrite;

  const candidates: { owner: string; repo: string; entry: Entry }[] = [];
  for (const e of entries) {
    const r = e.repoStr;
    const [owner, repo] = r.split('/');
    if (!owner || !repo) continue;
    const needsDescription = !(e.hasDescription) || overwriteDescription;
    const needsTopics = !(e.hasTopics) || overwriteTopics;
    if (!needsDescription && !needsTopics) {
      console.log(`Skipping ${owner}/${repo}: has description and topics and not overwriting`);
      results.push({ owner, repo, result: null, applied: { description: false, topics: false }, skipped: true });
      continue;
    }
    candidates.push({ owner, repo, entry: e });
  }

  const cacheDir = process.env.OPENAI_CACHE_DIR || path.join(process.cwd(), 'generated');
  const cacheFile = path.join(cacheDir, 'llm-cache.json');
  await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
  let cache: Record<string, any> = {};
  try {
    const raw = await fs.readFile(cacheFile, 'utf8').catch(() => null);
    if (raw) cache = JSON.parse(raw);
  } catch (e) {
    cache = {};
  }

  let totalTokens = 0;
  const prompts: Record<string, { prompt: string; cacheKey: string }> = {};
  for (const c of candidates) {
    const { owner, repo } = c;
    let sha: string | undefined;
    try {
      const res = await client.rawRequest('GET', `/repos/${owner}/${repo}/commits?per_page=1`);
      if (Array.isArray(res.body) && res.body.length > 0) sha = res.body[0]?.sha;
    } catch (_) {
      try {
        const rm = await repos.getRepo(client, owner, repo);
        sha = (rm as any)?.pushed_at;
      } catch (_) {
        sha = undefined;
      }
    }
    const repoMeta = await repos.getRepo(client, owner, repo).catch(() => null) as any;
    const readmeResp = await repos.getReadme(client, owner, repo).catch(() => null) as any;
    const readme = readmeResp?.content ? Buffer.from((readmeResp as any).content, (readmeResp as any).encoding || 'base64').toString('utf8') : undefined;
    const topicsResp = await repos.getTopics(client, owner, repo).catch(() => null) as any;
    const topics = (topicsResp && (topicsResp as any).names) || (repoMeta && repoMeta.topics) || [];
    const prompt = await buildPromptString(args.promptFlag, { repo: repoMeta, readme, topics } as any);
    const est = Math.ceil(prompt.length / 4);
    totalTokens += est;
    const cacheKey = `${owner}/${repo}@${sha || (repoMeta && (repoMeta.pushed_at || repoMeta.updated_at)) || 'none'}`;
    prompts[`${owner}/${repo}`] = { prompt, cacheKey };
  }

  console.log(`LLM estimate: ${candidates.length} call(s), ~${totalTokens} tokens`);
  const autoApprove = process.env.OPENAI_AUTO_APPROVE === 'true' || process.env.CI === 'true' || !!process.env.NON_INTERACTIVE;
  if (apply && candidates.length > 0 && !autoApprove) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((res) => rl.question(`Proceed with ${candidates.length} LLM call(s) (~${totalTokens} tokens)? Type YES to continue: `, (a: string) => { rl.close(); res(a); }));
    if (String(answer).trim().toLowerCase() !== 'yes') {
      console.log('Aborting LLM describe step by user.');
      if (args.outPath) await fs.writeFile(args.outPath, JSON.stringify(results, null, 2), 'utf8');
      return { results };
    }
  }

  const chunkSize = Number(process.env.LLM_CHUNK_SIZE || '3');
  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (c) => {
      const { owner, repo } = c;
      const key = `${owner}/${repo}`;
      const pf = prompts[key];
      if (pf && cache[pf.cacheKey]) {
        console.log(`Using cached LLM result for ${owner}/${repo}`);
        results.push({ owner, repo, result: cache[pf.cacheKey].result, applied: { description: false, topics: false }, cached: true });
        return;
      }
      try {
        console.log(`Describing ${owner}/${repo}...`);
        const valid = await describeRepoWithLLM(client, cfg, args.promptFlag, owner, repo);
        console.log(`Described ${owner}/${repo}`);
        if (pf) cache[pf.cacheKey] = { result: valid, time: new Date().toISOString() };
        let appliedDescription = false;
        let appliedTopics = false;
        if (apply) {
          if (!overwriteDescription && c.entry.hasDescription) {
            console.log(`Skipping description update for ${owner}/${repo} (input already has description)`);
          } else {
            try { await repos.updateRepo(client, owner, repo, { description: valid.short_description }); appliedDescription = true; } catch (err) { console.error(`Failed to apply description for ${owner}/${repo}: ${(err as any)?.message || err}`); }
          }
          if (!overwriteTopics && c.entry.hasTopics) {
            console.log(`Skipping topics update for ${owner}/${repo} (input already has topics)`);
          } else {
            try { await repos.updateTopics(client, owner, repo, (valid.topics || []).slice(0,20)); appliedTopics = true; } catch (err) { console.error(`Failed to apply topics for ${owner}/${repo}: ${(err as any)?.message || err}`); }
          }
          console.log(`Apply results for ${owner}/${repo}: description=${appliedDescription} topics=${appliedTopics}`);
        }
        results.push({ owner, repo, result: valid, applied: { description: appliedDescription, topics: appliedTopics } });
      } catch (err) {
        console.error(`Describe failed for ${owner}/${repo}: ${(err as any)?.message || err}`);
        results.push({ owner, repo, error: (err as any)?.message || String(err) });
      }
    }));
    try { await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8'); } catch (e) { /* ignore */ }
  }

  return { results };
}

export async function writeOutput(resultObj: any, args: Args) {
  const results = resultObj?.results || [];
  const outPath = args.outPath;
  if (outPath) {
    if (outPath.endsWith('.json')) {
      const out = results.map((r: any) => ({ repo: `${r.owner}/${r.repo}`, ai: r.result, applied: r.applied }));
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    } else if (outPath.endsWith('.md') || outPath.endsWith('.markdown')) {
      const parts: string[] = [];
      for (const r of results) {
        parts.push(`## ${r.owner}/${r.repo}\n`);
        parts.push(`- **Applied description**: ${Boolean(r.applied?.description)}\n- **Applied topics**: ${Boolean(r.applied?.topics)}\n`);
        parts.push('```json');
        parts.push(JSON.stringify(r.result, null, 2));
        parts.push('```\n');
      }
      await fs.writeFile(outPath, parts.join('\n'), 'utf8');
      console.log('Wrote', outPath);
    } else {
      const out = results.map((r: any) => ({ repo: `${r.owner}/${r.repo}`, ai: r.result, applied: r.applied }));
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    }
  }
}

export async function describeReposCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}

export default describeReposCommand;
