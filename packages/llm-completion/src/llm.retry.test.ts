import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOpenAI } from './llm.js';

describe('Retry & Backoff Tests', () => {
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
