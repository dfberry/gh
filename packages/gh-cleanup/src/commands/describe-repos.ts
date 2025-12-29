import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMConfig } from 'llm-completion';
import { describeHelpers } from 'github-rest';
import { describeRepoWithLLM, createClient } from '../lib/describe-common.js';

  export async function describeReposCommand(argv: string[]) {
    const flags = argv.slice(0);
    const cfg: LLMConfig = {};
    let outPath: string | undefined;
    let promptFlag: string | undefined;
    const inputFlags: string[] = [];
    const apply = flags.includes('--apply');

    for (const a of flags) {
      if (a.startsWith('--openai-key=')) cfg.key = a.split('=')[1];
      if (a.startsWith('--openai-model=')) cfg.model = a.split('=')[1];
      if (a.startsWith('--openai-temp=')) cfg.temperature = Number(a.split('=')[1]);
      if (a.startsWith('--openai-endpoint=')) cfg.endpoint = a.split('=')[1];
      if (a.startsWith('--out=')) outPath = a.split('=')[1];
      if (a.startsWith('--prompt=')) promptFlag = a.split('=')[1];
      if (a.startsWith('--input=')) inputFlags.push(a.split('=')[1]);
      if (a.startsWith('--repos=')) inputFlags.push(...a.split('=')[1].split(',').map(s => s.trim()).filter(Boolean));
    }

    if (inputFlags.length === 0) {
      const safeCfg = Object.assign({}, cfg) as any;
      if (safeCfg.key) safeCfg.key = '[REDACTED]';
      throw new Error('Missing required flag --input=path.json or --repos=path1,path2. Usage: gh-cleanup describe-repos --input=path.json [--apply] [--out=path.json|path.md] [--prompt=path]. Parsed params: ' + JSON.stringify({ apply, outPath, promptFlag, cfg: safeCfg }));
    }

    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const client = createClient(token);

    const items: string[] = [];
    for (const inputPath of inputFlags) {
      const fileContent = await fs.readFile(inputPath, 'utf8');
      let parsedFile: any;
      try { parsedFile = JSON.parse(fileContent); } catch (e) { console.error('Failed to parse input JSON', inputPath); throw e; }

      if (Array.isArray(parsedFile)) {
        for (const it of parsedFile) {
          if (typeof it === 'string') items.push(it);
          else if (it && typeof it === 'object') {
            if (it.full_name) items.push(it.full_name);
            else if (it.owner && it.name) items.push(`${it.owner}/${it.name}`);
            else if (it.repo) items.push(it.repo);
            else if (it.repository && it.repository.full_name) items.push(it.repository.full_name);
            else if (it.html_url) {
              const m = it.html_url.match(/github.com\/(.+?)\/?$/);
              if (m) items.push(m[1]);
            }
          }
        }
      } else if (parsedFile && typeof parsedFile === 'object') {
        const arr = parsedFile.repos || parsedFile.items || parsedFile.repositories;
        if (Array.isArray(arr)) {
          for (const it of arr) {
            if (typeof it === 'string') items.push(it);
            else if (it && typeof it === 'object') {
              if (it.full_name) items.push(it.full_name);
              else if (it.owner && it.name) items.push(`${it.owner}/${it.name}`);
              else if (it.repo) items.push(it.repo);
              else if (it.repository && it.repository.full_name) items.push(it.repository.full_name);
              else if (it.html_url) {
                const m = it.html_url.match(/github.com\/(.+?)\/?$/);
                if (m) items.push(m[1]);
              }
            }
          }
        }
      }
    }

    const results: any[] = [];
    for (const r of items) {
      const [owner, repo] = r.split('/');
      if (!owner || !repo) continue;

      console.log(`Describing ${owner}/${repo}...`);
      const valid = await describeRepoWithLLM(client, cfg, promptFlag, owner, repo);
      const res = { owner, repo, result: valid };
      console.log(`Described ${owner}/${repo}`);
      results.push(res);
      if (apply) {
        await describeHelpers.updateRepo(client, owner, repo, { description: res.result.short_description }).catch(()=>null);
        await describeHelpers.updateTopics(client, owner, repo, (res.result.topics || []).slice(0,20)).catch(()=>null);
        console.log(`Applied description and topics to ${owner}/${repo}`);
      }
    }

    if (outPath) {
      if (outPath.endsWith('.json')) {
        const out = results.map((r) => ({ repo: `${r.owner}/${r.repo}`, ...r.result }));
        await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
        console.log('Wrote', outPath);
      } else if (outPath.endsWith('.md') || outPath.endsWith('.markdown')) {
        const parts: string[] = [];
        for (const r of results) {
          parts.push(`## ${r.owner}/${r.repo}\n`);
          parts.push('```json');
          parts.push(JSON.stringify(r.result, null, 2));
          parts.push('```\n');
        }
        await fs.writeFile(outPath, parts.join('\n'), 'utf8');
        console.log('Wrote', outPath);
      } else {
        const out = results.map((r) => ({ repo: `${r.owner}/${r.repo}`, ...r.result }));
        await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
        console.log('Wrote', outPath);
      }
    }
  }
