import { GitHubError, RateLimitError } from './errors.js';
export class GitHubClient {
    token;
    baseUrl;
    userAgent;
    retry;
    constructor(opts = {}) {
        this.token = opts.token ?? process.env.GH_TOKEN;
        this.baseUrl = opts.baseUrl ?? 'https://api.github.com';
        this.userAgent = opts.userAgent ?? 'github-rest/0.1';
        this.retry = opts.retry;
    }
    /**
     * Return the authenticated user object from GET /user
     */
    async getAuthenticatedUser() {
        return this.get('/user');
    }
    /**
     * Return an array of token scopes from the `x-oauth-scopes` header.
     */
    async getTokenScopes() {
        const res = await this.rawRequest('GET', '/user');
        const scopesHeader = (res.headers['x-oauth-scopes'] ?? '');
        return scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);
    }
    /**
     * Ensure the token has at least one of the required scopes. Returns missing scopes array.
     * If `abortOnMissing` is true the method will throw a GitHubError when required scopes are missing.
     */
    async ensureScopes(required, opts = { abortOnMissing: false }) {
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
    async hasRepoAdmin(owner, repo) {
        try {
            const r = await this.get(`/repos/${owner}/${repo}`);
            return Boolean(r?.permissions?.admin);
        }
        catch (e) {
            return false;
        }
    }
    buildHeaders(extra = {}) {
        const h = {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': this.userAgent,
            ...extra,
        };
        if (this.token)
            h.Authorization = `token ${this.token}`;
        return h;
    }
    async request(method, pathOrUrl, opts = {}) {
        const res = await this.rawRequest(method, pathOrUrl, opts);
        return res.body;
    }
    async rawRequest(method, pathOrUrl, opts = {}) {
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
        const init = {
            method,
            headers,
            signal: opts.signal,
        };
        if (opts.body !== undefined) {
            init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
            headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        }
        const res = await fetch(url, init);
        const rawHeaders = {};
        res.headers.forEach((v, k) => (rawHeaders[k.toLowerCase()] = v));
        const contentType = res.headers.get('content-type') ?? '';
        let body;
        if (contentType.includes('application/json')) {
            body = await res.json().catch(() => undefined);
        }
        else {
            body = await res.text().catch(() => undefined);
        }
        if (!res.ok) {
            if (res.status === 429 || res.status >= 500) {
                throw new RateLimitError(`GitHub API error ${res.status}`, res.status, rawHeaders, body);
            }
            throw new GitHubError(`GitHub API error ${res.status}`, res.status, rawHeaders, body);
        }
        return { body: body, headers: rawHeaders, status: res.status };
    }
    get(path, opts) {
        return this.request('GET', path, opts);
    }
    post(path, body) {
        return this.request('POST', path, { body });
    }
    patch(path, body) {
        return this.request('PATCH', path, { body });
    }
    del(path) {
        return this.request('DELETE', path);
    }
}
