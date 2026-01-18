export class GitHubError extends Error {
    status;
    headers;
    body;
    constructor(message, status, headers, body) {
        super(message);
        this.name = 'GitHubError';
        this.status = status;
        this.headers = headers;
        this.body = body;
    }
}
export class RateLimitError extends GitHubError {
    resetAt;
    remaining;
    limit;
    constructor(message, status, headers, body) {
        super(message, status, headers, body);
        this.name = 'RateLimitError';
        const rem = headers['x-ratelimit-remaining'];
        const reset = headers['x-ratelimit-reset'];
        const limit = headers['x-ratelimit-limit'];
        if (rem)
            this.remaining = Number(rem);
        if (reset)
            this.resetAt = Number(reset) * 1000;
        if (limit)
            this.limit = Number(limit);
    }
}
