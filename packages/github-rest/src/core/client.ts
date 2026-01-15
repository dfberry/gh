import { GitHubError, RateLimitError } from './errors.js';

export type RetryOptions = {
  attempts?: number;
  factor?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
};

export class GitHubClient {
  token?: string;
  baseUrl: string;
  userAgent: string;
  retry?: RetryOptions;

  constructor(opts: { token?: string; baseUrl?: string; userAgent?: string; retry?: RetryOptions } = {}) {
    this.token = opts.token ?? process.env.GH_TOKEN;
    this.baseUrl = opts.baseUrl ?? 'https://api.github.com';
    this.userAgent = opts.userAgent ?? 'github-rest/0.1';
    this.retry = opts.retry;
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
      if (res.status === 429 || res.status >= 500) {
        throw new RateLimitError(`GitHub API error ${res.status}`, res.status, rawHeaders, body);
      }
      throw new GitHubError(`GitHub API error ${res.status}`, res.status, rawHeaders, body);
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
