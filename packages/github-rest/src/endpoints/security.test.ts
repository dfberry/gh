import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubClient } from '../core/client.js';
import { isVulnerabilityAlertsEnabled } from './security.js';

describe('security.isVulnerabilityAlertsEnabled', () => {
  let client: GitHubClient;
  beforeEach(() => {
    client = new GitHubClient({ token: 'x' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when API responds 204', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const out = await isVulnerabilityAlertsEnabled(client, 'owner', 'repo');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledTimes(1);
    const args = raw.mock.calls[0];
    expect(args[0]).toBe('GET');
    expect(args[1]).toBe('/repos/owner/repo/vulnerability-alerts');
    // default: no headers passed
    expect(args[2]).not.toHaveProperty('headers');
  });

  it('returns false when API responds 404', async () => {
    const err: any = new Error('not found');
    err.status = 404;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    const out = await isVulnerabilityAlertsEnabled(client, 'owner', 'repo');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server error');
    err.status = 500;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    await expect(isVulnerabilityAlertsEnabled(client, 'owner', 'repo')).rejects.toThrow(/server error/);
  });

  it('sends Accept header when options.accept is provided', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const out = await isVulnerabilityAlertsEnabled(client, 'owner', 'repo', { accept: 'application/vnd.github+json' });
    expect(out).toBe(true);
    const args = raw.mock.calls[0];
    expect(args[2]).toHaveProperty('headers');
    expect(args[2].headers.Accept).toContain('application/vnd.github+json');
  });
});

describe('security.isAutomatedSecurityFixesEnabled', () => {
  let client: GitHubClient;
  beforeEach(() => {
    client = new GitHubClient({ token: 'x' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when API responds 204', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).isAutomatedSecurityFixesEnabled(client, 'owner', 'repo');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledTimes(1);
    const args = raw.mock.calls[0];
    expect(args[0]).toBe('GET');
    expect(args[1]).toBe('/repos/owner/repo/automated-security-fixes');
  });

  it('returns false when API responds 404', async () => {
    const err: any = new Error('not found');
    err.status = 404;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).isAutomatedSecurityFixesEnabled(client, 'owner', 'repo');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server error');
    err.status = 500;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    await expect((await import('./security.js')).isAutomatedSecurityFixesEnabled(client, 'owner', 'repo')).rejects.toThrow(/server error/);
  });

  it('sends Accept header when options.accept is provided', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).isAutomatedSecurityFixesEnabled(client, 'owner', 'repo', { accept: 'application/vnd.github+json' });
    expect(out).toBe(true);
    const args = raw.mock.calls[0];
    expect(args[2]).toHaveProperty('headers');
    expect(args[2].headers.Accept).toContain('application/vnd.github+json');
  });
});

describe('security.hasDependabotConfig', () => {
  let client: GitHubClient;
  beforeEach(() => {
    client = new GitHubClient({ token: 'x' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when .github/dependabot.yml exists', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: {} });
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).hasDependabotConfig(client, 'owner', 'repo');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0][1]).toContain('.github/dependabot.yml');
  });

  it('falls back to .yaml when .yml is missing', async () => {
    const raw = vi.fn().mockImplementation((method: string, path: string) => {
      if (path.includes('.github/dependabot.yml')) {
        const e: any = new Error('not found'); e.status = 404; return Promise.reject(e);
      }
      return Promise.resolve({ status: 200, headers: {}, body: {} });
    });
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).hasDependabotConfig(client, 'owner', 'repo');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it('returns false when neither file exists', async () => {
    const err: any = new Error('not found'); err.status = 404;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    const out = await (await import('./security.js')).hasDependabotConfig(client, 'owner', 'repo');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server error'); err.status = 500;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    await expect((await import('./security.js')).hasDependabotConfig(client, 'owner', 'repo')).rejects.toThrow(/server error/);
  });
});

describe('security.isSecretScanningEnabled', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when repo.security_and_analysis.secret_scanning enabled', async () => {
    const get = vi.fn().mockResolvedValue({ security_and_analysis: { secret_scanning: { status: 'enabled' } } });
    (client as any).get = get;
    const out = await (await import('./security.js')).isSecretScanningEnabled(client, 'o', 'r');
    expect(out).toBe(true);
  });

  it('returns false when not present', async () => {
    const get = vi.fn().mockResolvedValue({});
    (client as any).get = get;
    const out = await (await import('./security.js')).isSecretScanningEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('returns false on 404', async () => {
    const err: any = new Error('not found'); err.status = 404;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    const out = await (await import('./security.js')).isSecretScanningEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server'); err.status = 500;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    await expect((await import('./security.js')).isSecretScanningEnabled(client, 'o', 'r')).rejects.toThrow(/server/);
  });
});

describe('security.isCodeScanningEnabled', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when advanced_security enabled', async () => {
    const get = vi.fn().mockResolvedValue({ security_and_analysis: { advanced_security: { status: 'enabled' } } });
    (client as any).get = get;
    const out = await (await import('./security.js')).isCodeScanningEnabled(client, 'o', 'r');
    expect(out).toBe(true);
  });

  it('returns false when not present', async () => {
    const get = vi.fn().mockResolvedValue({});
    (client as any).get = get;
    const out = await (await import('./security.js')).isCodeScanningEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('returns false on 404', async () => {
    const err: any = new Error('not found'); err.status = 404;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    const out = await (await import('./security.js')).isCodeScanningEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server'); err.status = 500;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    await expect((await import('./security.js')).isCodeScanningEnabled(client, 'o', 'r')).rejects.toThrow(/server/);
  });
});

describe('security.isDependencyGraphEnabled', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when dependency_graph enabled', async () => {
    const get = vi.fn().mockResolvedValue({ security_and_analysis: { dependency_graph: { status: 'enabled' } } });
    (client as any).get = get;
    const out = await (await import('./security.js')).isDependencyGraphEnabled(client, 'o', 'r');
    expect(out).toBe(true);
  });

  it('returns false when not present', async () => {
    const get = vi.fn().mockResolvedValue({});
    (client as any).get = get;
    const out = await (await import('./security.js')).isDependencyGraphEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('returns false on 404', async () => {
    const err: any = new Error('not found'); err.status = 404;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    const out = await (await import('./security.js')).isDependencyGraphEnabled(client, 'o', 'r');
    expect(out).toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const err: any = new Error('server'); err.status = 500;
    const get = vi.fn().mockRejectedValue(err);
    (client as any).get = get;
    await expect((await import('./security.js')).isDependencyGraphEnabled(client, 'o', 'r')).rejects.toThrow(/server/);
  });
});

describe('security.enableVulnerabilityAlerts', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when PUT responds 204', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const fn = (await import('./security.js')).enableVulnerabilityAlerts;
    const out = await fn(client, 'o', 'r');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledWith('PUT', '/repos/o/r/vulnerability-alerts', expect.any(Object));
  });

  it('rethrows errors as GitHubError wrapper', async () => {
    const err: any = new Error('server'); err.status = 500;
    const raw = vi.fn().mockRejectedValue(err);
    (client as any).rawRequest = raw;
    const fn = (await import('./security.js')).enableVulnerabilityAlerts;
    await expect(fn(client, 'o', 'r')).rejects.toThrow(/server/);
  });
});

describe('security.enableAutomatedSecurityFixes', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when PUT responds 204', async () => {
    const raw = vi.fn().mockResolvedValue({ status: 204, headers: {}, body: undefined });
    (client as any).rawRequest = raw;
    const fn = (await import('./security.js')).enableAutomatedSecurityFixes;
    const out = await fn(client, 'o', 'r');
    expect(out).toBe(true);
    expect(raw).toHaveBeenCalledWith('PUT', '/repos/o/r/automated-security-fixes', expect.any(Object));
  });
});

describe('security.createOrUpdateFile', () => {
  let client: GitHubClient;
  beforeEach(() => { client = new GitHubClient({ token: 'x' }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('creates a new file when none exists', async () => {
    // GET returns 404, PUT returns 201
    const getErr: any = new Error('not found'); getErr.status = 404;
    const raw = vi.fn()
      .mockRejectedValueOnce(getErr) // GET existing
      .mockResolvedValueOnce({ status: 201, headers: {}, body: {} }); // PUT create
    (client as any).rawRequest = raw;
    const fn = (await import('./security.js')).createOrUpdateFile;
    const out = await fn(client, 'o', 'r', '.github/dependabot.yml', 'content', 'Add dependabot');
    expect(out).toBe(true);
    // first call GET, second call PUT
    expect(raw.mock.calls[0][0]).toBe('GET');
    expect(raw.mock.calls[1][0]).toBe('PUT');
  });

  it('updates existing file when sha present', async () => {
    const existing = { status: 200, headers: {}, body: { sha: 'abcd' } };
    const putRes = { status: 200, headers: {}, body: {} };
    const raw = vi.fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(putRes);
    (client as any).rawRequest = raw;
    const fn = (await import('./security.js')).createOrUpdateFile;
    const out = await fn(client, 'o', 'r', 'SECURITY.md', 'sec', 'update');
    expect(out).toBe(true);
    expect(raw.mock.calls[0][0]).toBe('GET');
    expect(raw.mock.calls[1][0]).toBe('PUT');
  });
});
