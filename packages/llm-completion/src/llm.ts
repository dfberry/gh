export type LLMConfig = {
  key?: string; // API key
  model?: string;
  temperature?: number;
  endpoint?: string; // full completions endpoint
  debug?: {
    enabled?: boolean;
    dir?: string; // directory to write debug files
  };
};

export async function callOpenAI(prompt: string, cfg?: LLMConfig, opts?: { name?: string }) : Promise<string> {
  const apiKey = cfg?.key ?? process.env.OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI API key not set (provide via config.key or OPENAI_API_KEY)');

  const model = cfg?.model ?? process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_MODEL ?? 'gpt-4o-mini';
  const temperature = cfg?.temperature ?? (process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : 0.2);
  const endpoint = cfg?.endpoint ?? process.env.OPENAI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions';

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: 800
  };

  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') throw new Error('global fetch is not available in this environment');
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();

  // optionally write debug files: input prompt and full response JSON
  try {
    const dbg = cfg?.debug ?? undefined;
    if (dbg?.enabled && dbg.dir) {
      // lazy import fs to avoid Node-only dependency in non-node envs
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = await import('fs');
      const path = await import('path');
      const dir = dbg.dir;
      await fs.promises.mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:]/g, '-');
      const nameBase = opts?.name
        ? String(opts.name).replace(/[^a-zA-Z0-9._-]/g, '_')
        : `llm_${ts}`;
      const inFile = path.join(dir, `${nameBase}_input.txt`);
      const outFile = path.join(dir, `${nameBase}_output.json`);
      await fs.promises.writeFile(inFile, prompt, { encoding: 'utf8' });
      await fs.promises.writeFile(outFile, JSON.stringify(json, null, 2), { encoding: 'utf8' });
    }
  } catch (e) {
    // Do not fail the call due to debug write errors — just console.warn if available
    try { console.warn && console.warn('llm debug write failed', e); } catch (_) {}
  }

  return json?.choices?.[0]?.message?.content ?? '';
}
