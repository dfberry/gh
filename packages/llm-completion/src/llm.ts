export type LLMConfig = {
  key?: string; // API key
  model?: string;
  temperature?: number;
  endpoint?: string; // full completions endpoint
};

export async function callOpenAI(prompt: string, cfg?: LLMConfig) : Promise<string> {
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
  return json?.choices?.[0]?.message?.content ?? '';
}
