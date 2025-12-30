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
      if (a === '--debug') cfg.debug = { ...(cfg.debug || {}), enabled: true };
      if (a.startsWith('--debug-dir=')) cfg.debug = { ...(cfg.debug || {}), dir: a.split('=')[1], enabled: true };
    }

    if (inputFlags.length === 0) {
      const safeCfg = Object.assign({}, cfg) as any;
      if (safeCfg.key) safeCfg.key = '[REDACTED]';
      throw new Error('Missing required flag --input=path.json or --repos=path1,path2. Usage: gh-cleanup describe-repos --input=path.json [--apply] [--out=path.json|path.md] [--prompt=path]. Parsed params: ' + JSON.stringify({ apply, outPath, promptFlag, cfg: safeCfg }));
    }

    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const client = createClient(token);

    type Entry = { repoStr: string; hasDescription?: boolean; hasTopics?: boolean };
    const entries: Entry[] = [];
    for (const inputPath of inputFlags) {
      const fileContent = await fs.readFile(inputPath, 'utf8');
      let parsedFile: any;
      try { parsedFile = JSON.parse(fileContent); } catch (e) { console.error('Failed to parse input JSON', inputPath); throw e; }

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
    const overwrite = flags.includes('--overwrite');
    const overwriteDescription = flags.includes('--overwrite-description') || overwrite;
    const overwriteTopics = flags.includes('--overwrite-topics') || overwrite;

    for (const e of entries) {
      const r = e.repoStr;
      const [owner, repo] = r.split('/');
      if (!owner || !repo) continue;

      console.log(`Describing ${owner}/${repo}...`);
      const valid = await describeRepoWithLLM(client, cfg, promptFlag, owner, repo);
      console.log(`Described ${owner}/${repo}`);
      let appliedDescription = false;
      let appliedTopics = false;
      if (apply) {
        if (!overwriteDescription && e.hasDescription) {
          console.log(`Skipping description update for ${owner}/${repo} (input already has description)`);
        } else {
          try {
            await describeHelpers.updateRepo(client, owner, repo, { description: valid.short_description });
            appliedDescription = true;
          } catch (err) {
            console.error(`Failed to apply description for ${owner}/${repo}: ${(err as any)?.message || err}`);
          }
        }
        if (!overwriteTopics && e.hasTopics) {
          console.log(`Skipping topics update for ${owner}/${repo} (input already has topics)`);
        } else {
          try {
            await describeHelpers.updateTopics(client, owner, repo, (valid.topics || []).slice(0,20));
            appliedTopics = true;
          } catch (err) {
            console.error(`Failed to apply topics for ${owner}/${repo}: ${(err as any)?.message || err}`);
          }
        }
        console.log(`Apply results for ${owner}/${repo}: description=${appliedDescription} topics=${appliedTopics}`);
      }
      const res = { owner, repo, result: valid, applied: { description: appliedDescription, topics: appliedTopics } };
      results.push(res);
    }

    if (outPath) {
      if (outPath.endsWith('.json')) {
        const out = results.map((r) => ({ repo: `${r.owner}/${r.repo}`, ai: r.result, applied: r.applied }));
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
        const out = results.map((r) => ({ repo: `${r.owner}/${r.repo}`, ai: r.result, applied: r.applied }));
        await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
        console.log('Wrote', outPath);
      }
    }
  }
