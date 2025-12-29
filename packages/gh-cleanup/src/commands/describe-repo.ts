import * as fs from 'fs/promises';
import * as path from 'path';
import { callOpenAI, LLMConfig } from 'llm-completion';
import { describeHelpers } from 'github-rest';
import { validateDescribeOutput } from '../lib/describe-validator.js';

function createClient(token?: string) {
  const API = 'https://api.github.com';
  const auth = token ? { Authorization: `token ${token}` } : {};
  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') throw new Error('global fetch is not available');
  return {
    get: async (path: string, opts?: any) => {
      const res = await fetchFn(API + path, { method: 'GET', headers: { Accept: 'application/vnd.github+json', ...auth, ...(opts?.headers || {}) } });
      if (!res.ok) throw Object.assign(new Error(`GET ${path} -> ${res.status}`), { status: res.status, body: await res.text() });
      return res.json();
    },
    put: async (path: string, body: any) => {
      const res = await fetchFn(API + path, { method: 'PUT', headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) });
      if (!res.ok) throw Object.assign(new Error(`PUT ${path} -> ${res.status}`), { status: res.status, body: await res.text() });
      return res.json();
    },
    patch: async (path: string, body: any) => {
      const res = await fetchFn(API + path, { method: 'PATCH', headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) });
      if (!res.ok) throw Object.assign(new Error(`PATCH ${path} -> ${res.status}`), { status: res.status, body: await res.text() });
      return res.json();
    }
  } as any;
}

export async function describeRepoCommand(argv: string[]) {
  // singular: require --repo=owner/repo (no positional args)
  const flags = argv.slice(0);
  const cfg: LLMConfig = {};
  let outPath: string | undefined = undefined;
  let promptFlag: string | undefined = undefined;
  let repoFlag: string | undefined = undefined;
  const apply = flags.includes('--apply');
  for (const a of flags) {
    if (a.startsWith('--openai-key=')) cfg.key = a.split('=')[1];
    if (a.startsWith('--openai-model=')) cfg.model = a.split('=')[1];
    if (a.startsWith('--openai-temp=')) cfg.temperature = Number(a.split('=')[1]);
    if (a.startsWith('--openai-endpoint=')) cfg.endpoint = a.split('=')[1];
    if (a.startsWith('--out=')) outPath = a.split('=')[1];
    if (a.startsWith('--prompt=')) promptFlag = a.split('=')[1];
    if (a.startsWith('--repo=')) repoFlag = a.split('=')[1];
  }

  if (!repoFlag) {
    const safeCfg = Object.assign({}, cfg);
    if ((safeCfg as any).key) (safeCfg as any).key = '[REDACTED]';
    throw new Error('Missing required flag --repo=owner/repo. Usage: gh-cleanup describe-repo --repo=owner/repo [--apply] [--out=path.json|path.md] [--prompt=path]. Parsed params: ' + JSON.stringify({ apply, outPath, promptFlag, cfg: safeCfg }));
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const client = createClient(token);

  async function processOne(owner: string, repo: string) {
    const repoMeta: any = await describeHelpers.getRepo(client, owner, repo);
    const readmeResp: any = await describeHelpers.getReadme(client, owner, repo).catch(()=>null);
    let readme: string | undefined = undefined;
    if (readmeResp?.content) {
      const enc = readmeResp.encoding || 'base64';
      readme = Buffer.from(readmeResp.content, enc as BufferEncoding).toString('utf8');
    }
    const topicsResp: any = await describeHelpers.getTopics(client, owner, repo).catch(()=>null);
    const topics: string[] = topicsResp?.names || repoMeta?.topics || [];

    // Resolve prompt file: use --prompt= if provided, otherwise search upwards
    async function resolvePromptFile(): Promise<string> {
      if (promptFlag) return path.resolve(promptFlag);
      let dir = process.cwd();
      const root = path.parse(dir).root;
      while (true) {
        const candidate = path.join(dir, '.github', 'LLM_DESCRIBE_REPO_PROMPT.md');
        try { await fs.access(candidate); return candidate; } catch {}
        if (dir === root) break;
        dir = path.dirname(dir);
      }
      throw new Error('Prompt file not found; pass --prompt=/path/to/LLM_DESCRIBE_REPO_PROMPT.md');
    }

    const promptFile = await resolvePromptFile();
    const promptTemplate = await fs.readFile(promptFile, 'utf8');
    const bundle = { repo: repoMeta, readme, topics };
    const prompt = `${promptTemplate}\n\n${JSON.stringify(bundle)}`;
    if (!cfg.key) cfg.key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!cfg.key) throw new Error('OpenAI API key not provided. Pass --openai-key=... or set OPENAI_API_KEY env var.');
    let llmResp: string;
    try {
      llmResp = await callOpenAI(prompt, cfg);
    } catch (err: any) {
      throw new Error(`OpenAI request failed for ${owner}/${repo}: ${err?.message || String(err)}`);
    }
    if (!llmResp || !llmResp.toString().trim()) {
      throw new Error(`OpenAI returned an empty response for ${owner}/${repo}. Check API key, model, endpoint, and prompt.`);
    }
    let parsed: any;
    const raw = llmResp?.toString() || '';
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      const firstLineEnd = cleaned.indexOf('\n');
      const lastFence = cleaned.lastIndexOf('```');
      if (firstLineEnd !== -1 && lastFence > firstLineEnd) {
        cleaned = cleaned.slice(firstLineEnd + 1, lastFence).trim();
      } else {
        cleaned = cleaned.replace(/```/g, '').trim();
      }
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    try {
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      throw new Error(`LLM did not return valid JSON for ${owner}/${repo}. Parse error: ${e?.message || e}\n\nRaw response:\n${raw}\n\nCleaned attempt:\n${cleaned}`);
    }
    const valid = validateDescribeOutput(parsed);
    return { owner, repo, result: valid };
  }

  // singular: process the provided --repo
  const [owner, repo] = repoFlag.split('/');
  if (!owner || !repo) {
    console.error('Invalid --repo value, expected owner/repo');
    return;
  }
  const res = await processOne(owner, repo);
  console.log(JSON.stringify(res.result, null, 2));
  if (apply) {
    await describeHelpers.updateRepo(client, owner, repo, { description: res.result.short_description });
    await describeHelpers.updateTopics(client, owner, repo, (res.result.topics || []).slice(0,20)).catch(()=>null);
    console.log('Applied description and topics');
  }

  // write aggregated output if requested (single item)
  if (outPath) {
    if (outPath.endsWith('.json')) {
      const out = [{ repo: `${owner}/${repo}`, ...res.result }];
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    } else if (outPath.endsWith('.md') || outPath.endsWith('.markdown')) {
      const parts: string[] = [];
      parts.push(`## ${owner}/${repo}\n`);
      parts.push('```json');
      parts.push(JSON.stringify(res.result, null, 2));
      parts.push('```\n');
      await fs.writeFile(outPath, parts.join('\n'), 'utf8');
      console.log('Wrote', outPath);
    } else {
      const out = [{ repo: `${owner}/${repo}`, ...res.result }];
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    }
  }
}
