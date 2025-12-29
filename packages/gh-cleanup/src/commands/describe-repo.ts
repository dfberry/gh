import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMConfig } from 'llm-completion';
import { describeHelpers } from 'github-rest';
import { describeRepoWithLLM, createClient } from '../lib/describe-common.js';

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
    const valid = await describeRepoWithLLM(client, cfg, promptFlag, owner, repo);
    return { owner, repo, result: valid };
  }

  // singular: process the provided --repo
  const [owner, repo] = repoFlag.split('/');
  if (!owner || !repo) {
    console.error('Invalid --repo value, expected owner/repo');
    return;
  }
  const res = await processOne(owner, repo);
  let appliedDescription = false;
  let appliedTopics = false;
  if (apply) {
    try {
      await describeHelpers.updateRepo(client, owner, repo, { description: res.result.short_description });
      appliedDescription = true;
    } catch (err) {
      console.error('Failed to apply description:', (err as any)?.message || err);
    }
    try {
      await describeHelpers.updateTopics(client, owner, repo, (res.result.topics || []).slice(0,20));
      appliedTopics = true;
    } catch (err) {
      console.error('Failed to apply topics:', (err as any)?.message || err);
    }
    console.log(`Apply results: description=${appliedDescription} topics=${appliedTopics}`);
  }
  // print ai result (include applied flags when --apply used)
  if (apply) console.log(JSON.stringify({ ai: res.result, applied: { description: appliedDescription, topics: appliedTopics } }, null, 2));
  else console.log(JSON.stringify(res.result, null, 2));

  // write aggregated output if requested (single item)
  if (outPath) {
    if (outPath.endsWith('.json')) {
      const out = [{ repo: `${owner}/${repo}`, ai: res.result, applied: { description: appliedDescription, topics: appliedTopics } }];
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    } else if (outPath.endsWith('.md') || outPath.endsWith('.markdown')) {
      const parts: string[] = [];
      parts.push(`## ${owner}/${repo}\n`);
      parts.push(`- **Applied description**: ${appliedDescription}\n- **Applied topics**: ${appliedTopics}\n`);
      parts.push('```json');
      parts.push(JSON.stringify(res.result, null, 2));
      parts.push('```\n');
      await fs.writeFile(outPath, parts.join('\n'), 'utf8');
      console.log('Wrote', outPath);
    } else {
      const out = [{ repo: `${owner}/${repo}`, ai: res.result, applied: { description: appliedDescription, topics: appliedTopics } }];
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote', outPath);
    }
  }
}
