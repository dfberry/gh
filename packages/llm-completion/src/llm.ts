export type LLMConfig = {
  key?: string; // API key
  model?: string;
  temperature?: number;
  maxTokens?: number; // maximum tokens in the completion response
  endpoint?: string; // full completions endpoint
  debug?: {
    enabled?: boolean;
    dir?: string; // directory to write debug files
  };
};

export async function callOpenAI(prompt: string, cfg?: LLMConfig, opts?: { name?: string }) : Promise<string> {
  // basic runtime validation
  if (typeof prompt !== 'string') throw new Error('prompt must be a string');

  const apiKey = cfg?.key ?? process.env.OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI API key not set (provide via config.key or OPENAI_API_KEY)');

  const model = cfg?.model ?? process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_MODEL ?? 'gpt-4o-mini';
  if (model != null && typeof model !== 'string') throw new Error('cfg.model must be a string');

  let temperature = cfg?.temperature ?? (process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : 0.2);
  temperature = Number(temperature);
  if (Number.isNaN(temperature)) throw new Error('temperature must be a number');
  // common valid range for temperature is [0,2]
  if (temperature < 0 || temperature > 2) throw new Error('temperature must be between 0 and 2');

  const endpoint = cfg?.endpoint ?? process.env.OPENAI_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions';
  try { new URL(endpoint); } catch (e) { throw new Error('endpoint is not a valid URL'); }

  const maxTokens = cfg?.maxTokens ?? (process.env.OPENAI_MAX_TOKENS ? Number(process.env.OPENAI_MAX_TOKENS) : 4096);
  if (Number.isNaN(maxTokens) || maxTokens <= 0) throw new Error('maxTokens must be a positive number');

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  };

  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') throw new Error('global fetch is not available in this environment');

  // Simple retry with exponential backoff. Respect Retry-After header when present.
  const maxRetries = 3;
  let attempt = 0;
  let lastErr: any = null;
  let json: any = null;
  while (attempt <= maxRetries) {
    try {
      // use AbortController to avoid hung requests
      // Increased timeout for large prompts (e.g., PR comment analysis)
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timeoutMs = 180000; // 3 minutes for large prompt processing
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller?.signal
      });
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        const ra = res.headers.get('retry-after');
        const status = res.status;
        const text = await res.text().catch(()=>'');
        lastErr = new Error(`HTTP ${status} ${text}`);
        if (ra) {
          const delay = Number(ra) * 1000 || 1000;
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }
        if (status === 429 || (status >= 500 && status < 600)) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, backoff));
          attempt++;
          continue;
        }
        // non-retriable
        const maybeJson = (() => { try { return JSON.parse(text); } catch { return null; } })();
        json = maybeJson;
        break;
      }
      json = await res.json().catch(() => null);
      break;
    } catch (e) {
      lastErr = e;
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, backoff));
      attempt++;
      continue;
    }
  }
  if (!json && lastErr) throw lastErr;

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
