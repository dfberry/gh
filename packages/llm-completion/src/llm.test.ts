import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOpenAI } from './llm.js';

// Test configurations used across groups
const happyConfigs = [
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

describe('Happy Paths', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => {
    vi.restoreAllMocks();
    try { delete (globalThis as any).fetch; } catch (_) {}
  });

  for (const t of happyConfigs) {
    it(t.name, async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => t.fetchJson,
        headers: { get: (_: string) => null }
      });

      const out = await callOpenAI(t.prompt, t.cfg);
      expect(out).toBe(t.expected);
      expect((globalThis as any).fetch).toHaveBeenCalled();
    });
  }
});

describe('Retry & Server Errors', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    try { delete (globalThis as any).fetch; } catch (_) {}
  });

  it('server 500 eventually throws after retries', async () => {
    const res500 = { ok: false, status: 500, headers: { get: () => null }, text: async () => 'Server error' };
    const fetchMock = vi.fn().mockResolvedValue(res500);
    (globalThis as any).fetch = fetchMock;

    const p = callOpenAI('This will fail', { key: 'k' });
    p.catch(() => {});
    // advance through exponential backoffs: 1k + 2k + 4k + 8k = 15000
    // @ts-ignore
    await vi.advanceTimersByTimeAsync?.(15000) ?? vi.advanceTimersByTime(15000);

    await expect(p).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('respects Retry-After header then succeeds', async () => {
    // first response has retry-after header '1' second call succeeds
    const first = { ok: false, status: 503, headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? '1' : null) }, text: async () => 'try later' };
    const successJson = { choices: [{ message: { content: 'After retry' } }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce({ ok: true, json: async () => successJson, headers: { get: () => null } });
    (globalThis as any).fetch = fetchMock;

    const p = callOpenAI('please retry', { key: 'k' });
    // advance by 1s for retry-after delay
    // @ts-ignore
    await vi.advanceTimersByTimeAsync?.(1000) ?? vi.advanceTimersByTime(1000);
    const out = await p;
    expect(out).toBe('After retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Auth, Quota & Network Errors', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    try { delete (globalThis as any).fetch; } catch (_) {}
  });

  it('auth 401 throws', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null }, text: async () => 'Unauthorized' });
    await expect(callOpenAI('Auth fail', { key: 'bad-key' })).rejects.toThrow(/HTTP 401/);
  });

  it('quota 429 retries then succeeds', async () => {
    const first = { ok: false, status: 429, headers: { get: () => null }, text: async () => 'Too many requests' };
    const successJson = { choices: [{ message: { content: 'Recovered response' } }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce({ ok: true, json: async () => successJson, headers: { get: () => null } });
    (globalThis as any).fetch = fetchMock;

    const p = callOpenAI('Retry quota', { key: 'k' });
    // advance first backoff 1s
    // @ts-ignore
    await vi.advanceTimersByTimeAsync?.(1000) ?? vi.advanceTimersByTime(1000);
    const out = await p;
    expect(out).toBe('Recovered response');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('network fetch throws and eventually errors after retries', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    (globalThis as any).fetch = fetchMock;

    const p = callOpenAI('Network fail', { key: 'k' });
    p.catch(() => {});
    // advance through exponential backoffs: 1k + 2k + 4k + 8k = 15000
    // @ts-ignore
    await vi.advanceTimersByTimeAsync?.(15000) ?? vi.advanceTimersByTime(15000);
    await expect(p).rejects.toThrow(/network down/);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('Edge Cases & Payload Validation', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => {
    vi.restoreAllMocks();
    try { delete (globalThis as any).fetch; } catch (_) {}
  });

  it('returns empty string when response has no choices', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), headers: { get: () => null } });
    const out = await callOpenAI('No choices', { key: 'k' });
    expect(out).toBe('');
  });

  it('sends expected request payload (model/messages/temperature)', async () => {
    const cfg = { key: 'k', model: 'my-model', temperature: 0.7 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), headers: { get: () => null } });
    (globalThis as any).fetch = fetchMock;

    await callOpenAI('Check payload', cfg);
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = (fetchMock as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe(cfg.model);
    expect(body.temperature).toBe(cfg.temperature);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0].content).toBe('Check payload');
  });
});

describe('Environment & Setup Errors', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('throws when API key not set', async () => {
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

  it('throws when global fetch is not available', async () => {
    const origFetch = (globalThis as any).fetch;
    try {
      try { delete (globalThis as any).fetch; } catch (_) {}
      await expect(callOpenAI('no fetch', { key: 'k' })).rejects.toThrow(/global fetch is not available/);
    } finally {
      if (origFetch) (globalThis as any).fetch = origFetch;
    }
  });
});

describe('Invalid Input Validation', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('throws for non-string prompt', async () => {
    // pass a valid key so prompt check happens first
    // @ts-ignore - intentionally passing wrong type
    await expect(callOpenAI(123 as any, { key: 'k' })).rejects.toThrow(/prompt must be a string/);
  });

  it('throws for NaN temperature', async () => {
    // @ts-ignore
    await expect(callOpenAI('hi', { key: 'k', temperature: 'not-a-number' as any })).rejects.toThrow(/temperature must be a number/);
  });

  it('throws for out-of-range temperature', async () => {
    await expect(callOpenAI('hi', { key: 'k', temperature: 3 })).rejects.toThrow(/temperature must be between 0 and 2/);
  });

  it('throws for invalid endpoint URL', async () => {
    await expect(callOpenAI('hi', { key: 'k', endpoint: 'not-a-url' })).rejects.toThrow(/endpoint is not a valid URL/);
  });
});
