export class GitHubError extends Error {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  constructor(message: string, status: number, headers: Record<string, string>, body?: unknown) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.headers = headers;
    this.body = body;
  }
}

export class RateLimitError extends GitHubError {
  resetAt?: number;
  remaining?: number;
  limit?: number;
  constructor(message: string, status: number, headers: Record<string, string>, body?: unknown) {
    super(message, status, headers, body);
    this.name = 'RateLimitError';
    const rem = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const limit = headers['x-ratelimit-limit'];
    if (rem) this.remaining = Number(rem);
    if (reset) this.resetAt = Number(reset) * 1000;
    if (limit) this.limit = Number(limit);
  }
}
