import { GitHubError, RateLimitError } from './errors.js';

export type RetryOptions = {
  attempts?: number;
  factor?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
};

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  used: number;
}

export interface TokenValidationResult {
  valid: boolean;
  login?: string;
  scopes?: string[];
  rateLimit?: RateLimitInfo;
  error?: string;
  suggestion?: string;
}

export interface RepoAccessResult {
  accessible: boolean;
  owner: string;
  repo: string;
  error?: string;
  suggestion?: string;
}

export class GitHubClient {
  token?: string;
  baseUrl: string;
  userAgent: string;
  retry?: RetryOptions;

  constructor(opts: { token?: string; baseUrl?: string; userAgent?: string; retry?: RetryOptions } = {}) {
    this.token = opts.token ?? process.env.GH_TOKEN;
    this.baseUrl = opts.baseUrl ?? 'https://api.github.com';
    this.userAgent = opts.userAgent ?? 'github-rest/0.1';
    this.retry = opts.retry ?? { attempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 60000 };
  }

  /**
   * Return the authenticated user object from GET /user
   */
  async getAuthenticatedUser<T = any>(): Promise<T> {
    return this.get<T>('/user');
  }

  /**
   * Return an array of token scopes from the `x-oauth-scopes` header.
   */
  async getTokenScopes(): Promise<string[]> {
    const res = await this.rawRequest('GET', '/user');
    const scopesHeader = (res.headers['x-oauth-scopes'] ?? '') as string;
    return scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Ensure the token has at least one of the required scopes. Returns missing scopes array.
   * If `abortOnMissing` is true the method will throw a GitHubError when required scopes are missing.
   */
  async ensureScopes(required: string[], opts: { abortOnMissing?: boolean } = { abortOnMissing: false }): Promise<string[]> {
    const have = await this.getTokenScopes();
    const missing = required.filter((r) => !have.includes(r));
    if (missing.length > 0 && opts.abortOnMissing) {
      throw new GitHubError('Missing required token scopes: ' + missing.join(', '), 401, {}, { missing });
    }
    return missing;
  }

  /**
   * Fetch rate limit information from GET /rate_limit.
   * This endpoint does NOT count against the rate limit.
   * Never throws — returns undefined if the request fails.
   */
  async getRateLimit(): Promise<RateLimitInfo | undefined> {
    try {
      const data = await this.get<{
        resources: { core: { limit: number; remaining: number; reset: number; used: number } };
      }>('/rate_limit');
      const core = data.resources.core;
      return {
        limit: core.limit,
        remaining: core.remaining,
        resetAt: new Date(core.reset * 1000),
        used: core.used,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Preflight check: validate the token without throwing.
   * Returns a result object with validity, login, scopes, rate limit, or an error message.
   */
  async validateToken(): Promise<TokenValidationResult> {
    if (!this.token || this.token.trim() === '') {
      return {
        valid: false,
        error: 'No token provided',
        suggestion: 'Set GITHUB_TOKEN in .env or pass token to GitHubClient constructor',
      };
    }

    try {
      const user = await this.getAuthenticatedUser<{ login: string }>();
      const scopes = await this.getTokenScopes();

      // Rate limit info is optional enrichment — don't fail validation if it errors
      const rateLimit = await this.getRateLimit();

      return { valid: true, login: user.login, scopes, rateLimit };
    } catch (err) {
      if (err instanceof GitHubError) {
        if (err.status === 401) {
          return {
            valid: false,
            error: 'Token is invalid or expired',
            suggestion: 'Check GITHUB_TOKEN in .env — the token may have been revoked or may have expired',
          };
        }
        if (err.status === 403) {
          return {
            valid: false,
            error: 'Token is rate-limited or blocked',
            suggestion: 'Wait for rate-limit reset or check token permissions at https://github.com/settings/tokens',
          };
        }
      }
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
        suggestion: 'Unexpected error — check network connectivity and GITHUB_TOKEN value',
      };
    }
  }

  /**
   * Check whether the current token has admin permission on the given repo.
   */
  async hasRepoAdmin(owner: string, repo: string): Promise<boolean> {
    try {
      const r = await this.get<any>(`/repos/${owner}/${repo}`);
      return Boolean(r?.permissions?.admin);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if a repo is accessible and return a structured result.
   * Never throws — returns `{ accessible: false, error, suggestion }` on failure.
   */
  async checkRepoAccess(owner: string, repo: string): Promise<RepoAccessResult> {
    try {
      await this.get(`/repos/${owner}/${repo}`);
      return { accessible: true, owner, repo };
    } catch (err) {
      if (err instanceof GitHubError) {
        const bodyMsg = typeof err.body === 'object' && err.body !== null && 'message' in (err.body as Record<string, unknown>)
          ? String((err.body as Record<string, unknown>).message)
          : '';

        if (err.status === 404) {
          return { accessible: false, owner, repo, error: 'Repository not found', suggestion: 'Check the repo name and ensure your token has access' };
        }
        if (err.status === 403 && bodyMsg.toLowerCase().includes('enterprise')) {
          return { accessible: false, owner, repo, error: bodyMsg, suggestion: 'Adjust your PAT lifetime or use a fine-grained token' };
        }
        if (err.status === 403) {
          return { accessible: false, owner, repo, error: bodyMsg || 'Access forbidden', suggestion: 'Check token permissions or org settings' };
        }
        return { accessible: false, owner, repo, error: `HTTP ${err.status}: ${bodyMsg || err.message}` };
      }
      return { accessible: false, owner, repo, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private buildHeaders(extra: Record<string, string> = {}) {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.userAgent,
      ...extra,
    };
    if (this.token) h.Authorization = `token ${this.token}`;
    return h;
  }

  async request<T = unknown>(method: string, pathOrUrl: string, opts: { params?: Record<string, string | number>; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
    const res = await this.rawRequest<T>(method, pathOrUrl, opts);
    return res.body;
  }

  async rawRequest<T = unknown>(method: string, pathOrUrl: string, opts: { params?: Record<string, string | number>; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<{ body: T; headers: Record<string, string>; status: number }> {
    const maxAttempts = this.retry?.attempts ?? 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this._singleRequest<T>(method, pathOrUrl, opts);
      } catch (err) {
        lastError = err as Error;

        if (!(err instanceof RateLimitError)) throw err;
        if (attempt === maxAttempts) throw err;

        // Rate limit (429 or 403 rate limit) — wait for reset
        if (err.status === 429 || err.status === 403) {
          const waitMs = err.resetAt
            ? Math.min(err.resetAt - Date.now() + 1000, this.retry?.maxTimeoutMs ?? 60000)
            : (this.retry?.minTimeoutMs ?? 1000) * Math.pow(this.retry?.factor ?? 2, attempt - 1);
          const waitSec = Math.ceil(Math.max(waitMs, 1000) / 1000);
          console.log(`⏳ Rate limited. Retrying in ${waitSec}s... (attempt ${attempt}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, Math.max(waitMs, 1000)));
          continue;
        }

        // Server error (5xx) — exponential backoff with jitter
        if (err.status >= 500) {
          const baseMs = (this.retry?.minTimeoutMs ?? 1000) * Math.pow(this.retry?.factor ?? 2, attempt - 1);
          const jitter = baseMs * (0.8 + Math.random() * 0.4); // ±20%
          const waitMs = Math.min(jitter, this.retry?.maxTimeoutMs ?? 60000);
          const waitSec = Math.ceil(waitMs / 1000);
          console.log(`⏳ Server error ${err.status}. Retrying in ${waitSec}s... (attempt ${attempt}/${maxAttempts})`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        // Unknown RateLimitError variant — don't retry
        throw err;
      }
    }
    throw lastError!;
  }

  private async _singleRequest<T = unknown>(method: string, pathOrUrl: string, opts: { params?: Record<string, string | number>; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<{ body: T; headers: Record<string, string>; status: number }> {
    let url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    
    // Add query parameters if provided
    if (opts.params && Object.keys(opts.params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(opts.params)) {
        searchParams.append(key, String(value));
      }
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${searchParams.toString()}`;
    }
    
    const headers = this.buildHeaders(opts.headers);
    const init: RequestInit = {
      method,
      headers,
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    const res = await fetch(url, init);
    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (rawHeaders[k.toLowerCase()] = v));
    const contentType = res.headers.get('content-type') ?? '';
    let body: unknown;
    if (contentType.includes('application/json')) {
      body = await res.json().catch(() => undefined);
    } else {
      body = await res.text().catch(() => undefined);
    }
    if (!res.ok) {
      const apiMsg = typeof body === 'object' && body !== null && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : '';

      if (res.status === 429 || res.status >= 500) {
        throw new RateLimitError(
          apiMsg ? `GitHub API error ${res.status}: ${apiMsg}` : `GitHub API error ${res.status}`,
          res.status, rawHeaders, body,
        );
      }
      // Primary and secondary rate limit: 403 with exhausted quota or "rate limit" in body message
      if (res.status === 403) {
        if (rawHeaders['x-ratelimit-remaining'] === '0' || apiMsg.toLowerCase().includes('rate limit')) {
          throw new RateLimitError(
            apiMsg ? `GitHub API rate limit exceeded: ${apiMsg}` : `GitHub API rate limit exceeded`,
            res.status, rawHeaders, body,
          );
        }
      }
      throw new GitHubError(
        apiMsg ? `GitHub API error ${res.status}: ${apiMsg}` : `GitHub API error ${res.status}`,
        res.status, rawHeaders, body,
      );
    }
    return { body: body as T, headers: rawHeaders, status: res.status };
  }

  get<T = unknown>(path: string, opts?: { params?: Record<string, string | number>; signal?: AbortSignal }) {
    return this.request<T>('GET', path, opts as any);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body } as any);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body } as any);
  }

  del<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }
}
