import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ghRequest } from './request.js';

describe('ghRequest', () => {
  const url = 'https://api.github.com/test';
  const token = 'test-token';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns JSON data for a successful response', async () => {
    const mockData = { foo: 'bar' };
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    const result = await ghRequest(url, { token });
    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
        }),
      }),
    );
  });

  it('throws an error for a failed response', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Access denied',
    });
    await expect(ghRequest(url, { token })).rejects.toThrow(/GitHub API error: 403 Forbidden/);
  });

  it('sends a POST request with a body', async () => {
    const mockData = { result: 'ok' };
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    const body = { foo: 'bar' };
    await ghRequest(url, { token, method: 'POST', body });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  });
});
