import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMConfig } from 'llm-completion';
import { describeHelpers } from 'github-rest';
import { describeRepoWithLLM, createClient, buildPromptString } from '../lib/describe-common.js';

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

    // Build candidate list (only repos that need description/topics or are forced)
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

    // Load or create LLM cache
    const cacheDir = process.env.OPENAI_CACHE_DIR || path.join(process.cwd(), '.cache');
    const cacheFile = path.join(cacheDir, 'llm-cache.json');
    await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
    let cache: Record<string, any> = {};
    try { const raw = await fs.readFile(cacheFile, 'utf8').catch(()=>null); if (raw) cache = JSON.parse(raw); } catch (e) { cache = {}; }

    // Prepare prompts and estimate token usage
    let totalTokens = 0;
    const prompts: Record<string, { prompt: string; cacheKey: string }> = {};
    for (const c of candidates) {
      const { owner, repo } = c;
      // best-effort latest commit sha
      let sha: string | undefined;
      try {
        const res = await client.rawRequest('GET', `/repos/${owner}/${repo}/commits?per_page=1`);
        if (Array.isArray(res.body) && res.body.length > 0) sha = res.body[0]?.sha;
      } catch (_) {
        try { const rm = await describeHelpers.getRepo(client, owner, repo); sha = (rm as any)?.pushed_at; } catch(_) { sha = undefined; }
      }
      const repoMeta = await describeHelpers.getRepo(client, owner, repo).catch(()=>null) as any;
      const readmeResp = await describeHelpers.getReadme(client, owner, repo).catch(()=>null) as any;
      const readme = readmeResp?.content ? Buffer.from((readmeResp as any).content, (readmeResp as any).encoding || 'base64').toString('utf8') : undefined;
      const topicsResp = await describeHelpers.getTopics(client, owner, repo).catch(()=>null) as any;
      const topics = (topicsResp && (topicsResp as any).names) || (repoMeta && repoMeta.topics) || [];
      const prompt = await buildPromptString(promptFlag, { repo: repoMeta, readme, topics } as any);
      const est = Math.ceil(prompt.length / 4);
      totalTokens += est;
      const cacheKey = `${owner}/${repo}@${sha || (repoMeta && (repoMeta.pushed_at || repoMeta.updated_at)) || 'none'}`;
      prompts[`${owner}/${repo}`] = { prompt, cacheKey };
    }

    console.log(`LLM estimate: ${candidates.length} call(s), ~${totalTokens} tokens`);
    const autoApprove = process.env.OPENAI_AUTO_APPROVE === 'true' || process.env.CI === 'true' || !!process.env.NON_INTERACTIVE;
    if (apply && candidates.length > 0 && !autoApprove) {
      // ask user to confirm cost
      const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => rl.question(`Proceed with ${candidates.length} LLM call(s) (~${totalTokens} tokens)? Type YES to continue: `, (a: string) => { rl.close(); res(a); }));
      if (String(answer).trim().toLowerCase() !== 'yes') {
        console.log('Aborting LLM describe step by user.');
        if (outPath) await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');
        return;
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
          const valid = await describeRepoWithLLM(client, cfg, promptFlag, owner, repo);
          console.log(`Described ${owner}/${repo}`);
          if (pf) cache[pf.cacheKey] = { result: valid, time: new Date().toISOString() };
          let appliedDescription = false;
          let appliedTopics = false;
          if (apply) {
            if (!overwriteDescription && c.entry.hasDescription) {
              console.log(`Skipping description update for ${owner}/${repo} (input already has description)`);
            } else {
              try { await describeHelpers.updateRepo(client, owner, repo, { description: valid.short_description }); appliedDescription = true; } catch (err) { console.error(`Failed to apply description for ${owner}/${repo}: ${(err as any)?.message || err}`); }
            }
            if (!overwriteTopics && c.entry.hasTopics) {
              console.log(`Skipping topics update for ${owner}/${repo} (input already has topics)`);
            } else {
              try { await describeHelpers.updateTopics(client, owner, repo, (valid.topics || []).slice(0,20)); appliedTopics = true; } catch (err) { console.error(`Failed to apply topics for ${owner}/${repo}: ${(err as any)?.message || err}`); }
            }
            console.log(`Apply results for ${owner}/${repo}: description=${appliedDescription} topics=${appliedTopics}`);
          }
          results.push({ owner, repo, result: valid, applied: { description: appliedDescription, topics: appliedTopics } });
        } catch (err) {
          console.error(`Describe failed for ${owner}/${repo}: ${(err as any)?.message || err}`);
          results.push({ owner, repo, error: (err as any)?.message || String(err) });
        }
      }));
      // persist cache
      try { await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8'); } catch (e) { /* ignore */ }
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
