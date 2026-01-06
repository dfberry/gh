import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOpenAI } from './llm.js';

it('sanity: callOpenAI is a function', () => {
  expect(typeof callOpenAI).toBe('function');
});

it('sanity: minimal mocked fetch returns expected string', async () => {
  (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), headers: { get: () => null } });
  const out = await callOpenAI('hi', { key: 'k' });
  expect(out).toBe('ok');
});

const happyConfigsTable = [
  {
    name: 'basic success',
    prompt: 'Hello LLM',
    cfg: { key: 'test-key' },
    fetchJson: { choices: [{ message: { content: 'Hello response' } }] },
    expected: 'Hello response'
  },
  {
    name: 'model override',
    prompt: 'Give me a token',
    cfg: { key: 'k', model: 'gpt-test', temperature: 0.5 },
    fetchJson: { choices: [{ message: { content: 'Model response' } }] },
    expected: 'Model response'
  }
];

describe('Table-driven: Happy & Edge Cases', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => {
    vi.restoreAllMocks();
    try { delete (globalThis as any).fetch; } catch (_) {}
  });

  it('happy path cases', async () => {
    for (const t of happyConfigsTable) {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => t.fetchJson, headers: { get: () => null } });
      const out = await callOpenAI(t.prompt, t.cfg);
      expect(out).toBe(t.expected);
      expect((globalThis as any).fetch).toHaveBeenCalled();
    }
  });

  const edgeCases = [
    {
      name: 'no choices returns empty string',
      setup: () => { (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), headers: { get: () => null } }); },
      run: async () => {
        const out = await callOpenAI('No choices', { key: 'k' });
        expect(out).toBe('');
      }
    },
    {
      name: 'payload contains model/messages/temperature',
      setup: () => {
        const cfg = { key: 'k', model: 'my-model', temperature: 0.7 };
        (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), headers: { get: () => null } });
        return cfg;
      },
      run: async () => {
        const cfg = { key: 'k', model: 'my-model', temperature: 0.7 };
        await callOpenAI('Check payload', cfg);
        const fetchMock = (globalThis as any).fetch as any;
        expect(fetchMock).toHaveBeenCalled();
        const callArgs = fetchMock.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.model).toBe(cfg.model);
        expect(body.temperature).toBe(cfg.temperature);
        expect(Array.isArray(body.messages)).toBe(true);
        expect(body.messages[0].content).toBe('Check payload');
      }
    }
  ];

  it('edge cases table-driven', async () => {
    for (const c of edgeCases) {
      c.setup();
      await c.run();
    }
  });
});

describe('Table-driven: Environment & Invalid Input', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('missing API key throws', async () => {
    const origOpenKey = process.env.OPENAI_API_KEY;
    const origAzureKey = process.env.AZURE_OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_API_KEY;
      await expect(callOpenAI('no key')).rejects.toThrow(/OPENAI API key not set/);
    } finally {
      if (origOpenKey !== undefined) process.env.OPENAI_API_KEY = origOpenKey;
      if (origAzureKey !== undefined) process.env.AZURE_OPENAI_API_KEY = origAzureKey;
    }
  });

  it('missing global fetch throws', async () => {
    const origFetch = (globalThis as any).fetch;
    try {
      try { delete (globalThis as any).fetch; } catch (_) {}
      await expect(callOpenAI('no fetch', { key: 'k' })).rejects.toThrow(/global fetch is not available/);
    } finally {
      if (origFetch) (globalThis as any).fetch = origFetch;
    }
  });

  const invalidCases = [
    { name: 'non-string prompt', run: async () => { /* @ts-ignore */ await expect(callOpenAI(123 as any, { key: 'k' })).rejects.toThrow(/prompt must be a string/); } },
    { name: 'NaN temperature', run: async () => { /* @ts-ignore */ await expect(callOpenAI('hi', { key: 'k', temperature: 'not-a-number' as any })).rejects.toThrow(/temperature must be a number/); } },
    { name: 'out-of-range temperature', run: async () => { await expect(callOpenAI('hi', { key: 'k', temperature: 3 })).rejects.toThrow(/temperature must be between 0 and 2/); } },
    { name: 'invalid endpoint URL', run: async () => { await expect(callOpenAI('hi', { key: 'k', endpoint: 'not-a-url' })).rejects.toThrow(/endpoint is not a valid URL/); } }
  ];

  it('invalid input cases', async () => {
    for (const c of invalidCases) {
      await c.run();
    }
  });
});
