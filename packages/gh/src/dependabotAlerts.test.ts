import { getDependabotAlerts, DependabotAlert } from './dependabotAlerts.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('getDependabotAlerts', () => {
  const owner = 'test-owner';
  const repo = 'test-repo';
  const token = 'test-token';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns alerts for a valid token', async () => {
    const mockAlerts: DependabotAlert[] = [
      {
        number: 1,
        state: 'open',
        dependency: {
          package: { ecosystem: 'npm', name: 'lodash' },
          manifest_path: 'package.json',
        },
        security_advisory: {
          ghsa_id: 'GHSA-xxxx',
          summary: 'Test summary',
          description: 'Test description',
          severity: 'high',
          identifiers: [{ type: 'GHSA', value: 'GHSA-xxxx' }],
        },
        security_vulnerability: {
          package: { ecosystem: 'npm', name: 'lodash' },
          severity: 'high',
          vulnerable_version_range: '<4.17.21',
          first_patched_version: { identifier: '4.17.21' },
        },
        url: 'https://api.github.com/repos/test-owner/test-repo/dependabot/alerts/1',
        html_url: 'https://github.com/test-owner/test-repo/security/dependabot/1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        dismissed_at: null,
        dismissed_by: null,
        dismissed_reason: null,
        dismissed_comment: null,
      },
    ];
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAlerts,
    });
    const result = await getDependabotAlerts({ owner, repo, token });
    expect(result).toEqual(mockAlerts);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/repos/${owner}/${repo}/dependabot/alerts`),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
        }),
      }),
    );
  });

  it('throws an error for an invalid token', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Bad credentials',
    });
    await expect(getDependabotAlerts({ owner, repo, token: 'bad-token' })).rejects.toThrow(
      /GitHub API error: 401 Unauthorized/,
    );
  });
});
