import { GitHubClient } from '../core/client.js';
import { GitHubError } from '../core/errors.js';

export type SecurityCallOptions = {
  accept?: string | string[];
  signal?: AbortSignal;
};

export type ActiveSecurityConfig = {
  vulnerability_alerts: boolean;
  automated_security_fixes: boolean;
  dependabot_config_present: boolean;
  secret_scanning: boolean;
  code_scanning: boolean;
  dependency_graph: boolean;
  security_policy_file: boolean;
  permission_issue?: string | null;
};

/**
 * Return a best-effort ActiveSecurityConfig for the given repository.
 * Stage 1: GA-only checks. This function is a thin aggregator of the
 * probe helpers exported below.
 */
export async function getRepoSecurityConfig(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<ActiveSecurityConfig> {
  // NOTE: Stage 1 is strictly configuration/presence checks only.
  // It MUST NOT perform evaluations or list alerts. Alert listing and
  // actionable evaluations belong to Stage 2 (`evaluate` commands).
  // Run fast GA probes in parallel where possible
  const probes = [
    isVulnerabilityAlertsEnabled(client, owner, repo, opts),
    isAutomatedSecurityFixesEnabled(client, owner, repo, opts),
    hasDependabotConfig(client, owner, repo, opts),
  ];

  const [vulnerability_alerts, automated_security_fixes, dependabot_config_present] = await Promise.all(probes);

  // Default fallbacks
  let secret_scanning = false;
  let code_scanning = false;
  let dependency_graph = false;
  let security_policy_file = false;
  let permission_issue: string | null = null;

  // Check for SECURITY.md presence
  try {
    const sec = await client.rawRequest<any>('GET', `/repos/${owner}/${repo}/contents/SECURITY.md`, opts ? { signal: opts.signal } : {});
    if (sec.status === 200) security_policy_file = true;
  } catch (e: any) {
    if (e?.status && e.status === 404) {
      security_policy_file = false;
    } else if (e?.status && (e.status === 403 || e.status === 401)) {
      permission_issue = `cannot read repository contents (status ${e.status})`;
    } else {
      // ignore other errors for SECURITY.md probe
    }
  }

  // Try to read repo metadata for security_and_analysis flags (best-effort)
  try {
    const repoMeta: any = await client.get(`/repos/${owner}/${repo}`);
    const s = repoMeta?.security_and_analysis ?? null;
    if (s) {
      // attempt to infer booleans from commonly used shapes
      if (s?.secret_scanning?.status === 'enabled' || s?.secret_scanning === 'enabled' || s?.secret_scanning === true) secret_scanning = true;
      if (s?.advanced_security?.status === 'enabled' || s?.advanced_security === 'enabled' || s?.advanced_security === true) code_scanning = true;
      if (s?.dependency_graph?.status === 'enabled' || s?.dependency_graph === 'enabled' || s?.dependency_graph === true) dependency_graph = true;
    }
  } catch (err: any) {
    if (err?.status && (err.status === 403 || err.status === 401)) {
      permission_issue = permission_issue ?? `repo metadata not visible (status ${err.status})`;
    }
    // otherwise ignore and leave defaults
  }

  return {
    vulnerability_alerts,
    automated_security_fixes,
    dependabot_config_present,
    secret_scanning,
    code_scanning,
    dependency_graph,
    security_policy_file,
    permission_issue: permission_issue ?? undefined,
  };
}

export async function isVulnerabilityAlertsEnabled(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  const path = `/repos/${owner}/${repo}/vulnerability-alerts`;
  const requestOpts: any = {};
  if (opts?.signal) requestOpts.signal = opts.signal;
  // Only add Accept header when explicitly provided in options (Stage 1: do not send previews by default)
  if (opts?.accept) {
    const acc = Array.isArray(opts.accept) ? opts.accept.join(', ') : opts.accept;
    requestOpts.headers = { Accept: acc };
  }

  try {
    const res = await client.rawRequest<any>('GET', path, requestOpts);
    // 204 => enabled
    return res.status === 204;
  } catch (err: any) {
    // 404 => disabled
    if (err?.status === 404) return false;
    // rethrow other errors
    throw err instanceof GitHubError ? err : new GitHubError(String(err?.message ?? 'Unknown error'), err?.status ?? 0, err?.headers ?? {}, err?.body ?? undefined);
  }
}

export async function isAutomatedSecurityFixesEnabled(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  const path = `/repos/${owner}/${repo}/automated-security-fixes`;
  const requestOpts: any = {};
  if (opts?.signal) requestOpts.signal = opts.signal;
  if (opts?.accept) {
    const acc = Array.isArray(opts.accept) ? opts.accept.join(', ') : opts.accept;
    requestOpts.headers = { Accept: acc };
  }

  try {
    const res = await client.rawRequest<any>('GET', path, requestOpts);
    return res.status === 204;
  } catch (err: any) {
    if (err?.status === 404) return false;
    throw err instanceof GitHubError ? err : new GitHubError(String(err?.message ?? 'Unknown error'), err?.status ?? 0, err?.headers ?? {}, err?.body ?? undefined);
  }
}

export async function hasDependabotConfig(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  const candidates = ['.github/dependabot.yml', '.github/dependabot.yaml'];
  const requestOpts: any = {};
  if (opts?.signal) requestOpts.signal = opts.signal;
  if (opts?.accept) {
    const acc = Array.isArray(opts.accept) ? opts.accept.join(', ') : opts.accept;
    requestOpts.headers = { Accept: acc };
  }

  for (const p of candidates) {
    const path = `/repos/${owner}/${repo}/contents/${p}`;
    try {
      const res = await client.rawRequest<any>('GET', path, requestOpts);
      // 200 => present
      if (res.status === 200) return true;
    } catch (err: any) {
      if (err?.status === 404) continue; // try next candidate
      throw err instanceof GitHubError ? err : new GitHubError(String(err?.message ?? 'Unknown error'), err?.status ?? 0, err?.headers ?? {}, err?.body ?? undefined);
    }
  }
  return false;
}


export async function isDependencyGraphEnabled(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  try {
    const r: any = await client.get(`/repos/${owner}/${repo}`);
    const s = r?.security_and_analysis ?? null;
    if (s) {
      if (s?.dependency_graph?.status === 'enabled' || s?.dependency_graph === 'enabled' || s?.dependency_graph === true) return true;
    }
    return false;
  } catch (err: any) {
    if (err?.status === 404) return false;
    throw err;
  }
}

export async function isSecretScanningEnabled(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  try {
    const r: any = await client.get(`/repos/${owner}/${repo}`);
    const s = r?.security_and_analysis ?? null;
    if (s) {
      if (s?.secret_scanning?.status === 'enabled' || s?.secret_scanning === 'enabled' || s?.secret_scanning === true) return true;
    }
    return false;
  } catch (err: any) {
    if (err?.status === 404) return false;
    throw err;
  }
}

export async function isCodeScanningEnabled(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  try {
    const r: any = await client.get(`/repos/${owner}/${repo}`);
    const s = r?.security_and_analysis ?? null;
    if (s) {
      if (s?.advanced_security?.status === 'enabled' || s?.advanced_security === 'enabled' || s?.advanced_security === true) return true;
    }
    return false;
  } catch (err: any) {
    if (err?.status === 404) return false;
    throw err;
  }
}

export default {} as const;

// --- Fix helpers (write/enable actions) ---

/**
 * Enable vulnerability alerts for a repository.
 * Returns true when the API indicates success (204).
 */
export async function enableVulnerabilityAlerts(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  const path = `/repos/${owner}/${repo}/vulnerability-alerts`;
  const requestOpts: any = {};
  if (opts?.signal) requestOpts.signal = opts.signal;
  if (opts?.accept) {
    const acc = Array.isArray(opts.accept) ? opts.accept.join(', ') : opts.accept;
    requestOpts.headers = { Accept: acc };
  }

  try {
    const res = await client.rawRequest<any>('PUT', path, requestOpts);
    return res.status === 204;
  } catch (err: any) {
    throw err instanceof GitHubError ? err : new GitHubError(String(err?.message ?? 'Unknown error'), err?.status ?? 0, err?.headers ?? {}, err?.body ?? undefined);
  }
}

/**
 * Enable automated security fixes for a repository.
 * Returns true when the API indicates success (204).
 */
export async function enableAutomatedSecurityFixes(client: GitHubClient, owner: string, repo: string, opts?: SecurityCallOptions): Promise<boolean> {
  const path = `/repos/${owner}/${repo}/automated-security-fixes`;
  const requestOpts: any = {};
  if (opts?.signal) requestOpts.signal = opts.signal;
  if (opts?.accept) {
    const acc = Array.isArray(opts.accept) ? opts.accept.join(', ') : opts.accept;
    requestOpts.headers = { Accept: acc };
  }

  try {
    const res = await client.rawRequest<any>('PUT', path, requestOpts);
    return res.status === 204;
  } catch (err: any) {
    throw err instanceof GitHubError ? err : new GitHubError(String(err?.message ?? 'Unknown error'), err?.status ?? 0, err?.headers ?? {}, err?.body ?? undefined);
  }
}

/**
 * Create or update a file in the repository using the Contents API.
 * - `path` should be relative inside the repo (e.g. `.github/dependabot.yml`).
 * - `content` is the UTF-8 plain text to commit.
 */
export async function createOrUpdateFile(client: GitHubClient, owner: string, repo: string, path: string, content: string, message: string, opts?: { branch?: string; committer?: { name: string; email: string }; signal?: AbortSignal }): Promise<boolean> {
  const fullPath = `/repos/${owner}/${repo}/contents/${path}`;
  const requestOptsAny: any = {};
  if (opts?.signal) requestOptsAny.signal = opts.signal;

  // Determine existing file SHA (if present)
  let sha: string | undefined = undefined;
  try {
    const existing = await client.rawRequest<any>('GET', fullPath, requestOptsAny);
    if (existing && existing.body && existing.body.sha) sha = existing.body.sha;
  } catch (e: any) {
    if (!(e?.status === 404)) {
      // real error
      throw e instanceof GitHubError ? e : new GitHubError(String(e?.message ?? 'Unknown error'), e?.status ?? 0, e?.headers ?? {}, e?.body ?? undefined);
    }
  }

  const payload: any = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) payload.sha = sha;
  if (opts?.branch) payload.branch = opts.branch;
  if (opts?.committer) payload.committer = opts.committer;

  try {
    const res = await client.rawRequest<any>('PUT', fullPath, { body: payload, signal: opts?.signal });
    // success codes: 201 (created) or 200 (updated)
    return res.status === 201 || res.status === 200;
  } catch (e: any) {
    throw e instanceof GitHubError ? e : new GitHubError(String(e?.message ?? 'Unknown error'), e?.status ?? 0, e?.headers ?? {}, e?.body ?? undefined);
  }
}
