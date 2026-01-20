import * as fs from 'fs/promises';
import * as path from 'path';
import { callOpenAI, LLMConfig } from 'llm-completion';
import { repos, createGitHubClient } from 'github-rest';
import { validateDescribeOutput } from './describe-validator.js';

export function createClient(token?: string) {
  return createGitHubClient({ token, userAgent: 'gh-cleanup/0.1' });
}

export async function resolvePromptFile(promptFlag?: string) {
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

export function sanitizeAndParseLLMResponse(llmResp: string | undefined, owner: string, repo: string) {
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
    return JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`LLM did not return valid JSON for ${owner}/${repo}. Parse error: ${e?.message || e}\n\nRaw response:\n${raw}\n\nCleaned attempt:\n${cleaned}`);
  }
}

export async function buildPromptString(promptFlag: string | undefined, bundle: { repo: any; readme?: string | undefined; topics?: string[] | undefined }) {
  const promptFile = await resolvePromptFile(promptFlag);
  const promptTemplate = await fs.readFile(promptFile, 'utf8');
  return `${promptTemplate}\n\n${JSON.stringify(bundle)}`;
}

export async function describeRepoWithLLM(client: any, cfg: LLMConfig, promptFlag: string | undefined, owner: string, repo: string) {
  const repoMeta: any = await repos.getRepo(client, owner, repo);
  const readmeResp: any = await repos.getReadme(client, owner, repo).catch(()=>null);
  let readme: string | undefined = undefined;
  if (readmeResp?.content) {
    const enc = readmeResp.encoding || 'base64';
    readme = Buffer.from(readmeResp.content, enc as BufferEncoding).toString('utf8');
  }
  const topicsResp: any = await repos.getTopics(client, owner, repo).catch(()=>null);
  const topics: string[] = topicsResp?.names || repoMeta?.topics || [];

  const bundle = { repo: repoMeta, readme, topics };
  const prompt = await buildPromptString(promptFlag, bundle);
  if (!cfg.key) cfg.key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!cfg.key) throw new Error('OpenAI API key not provided. Pass --openai-key=... or set OPENAI_API_KEY env var.');
  let llmResp: string;
  try {
    llmResp = await callOpenAI(prompt, cfg, { name: `${owner}_${repo}` });
  } catch (err: any) {
    throw new Error(`OpenAI request failed for ${owner}/${repo}: ${err?.message || String(err)}`);
  }
  if (!llmResp || !llmResp.toString().trim()) {
    throw new Error(`OpenAI returned an empty response for ${owner}/${repo}. Check API key, model, endpoint, and prompt.`);
  }
  const parsed = sanitizeAndParseLLMResponse(llmResp, owner, repo);
  const valid = validateDescribeOutput(parsed);
  return valid;
}
