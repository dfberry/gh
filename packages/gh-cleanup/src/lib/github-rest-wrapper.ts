/**
 * Normalized error details returned by `wrapGitHubRest` on failure.
 * Includes optional GitHub HTTP status, headers and parsed body/details.
 */
export type GitHubRestErrorDetails = {
  message: string;
  status?: number;
  headers?: Record<string, string>;
  code?: string;
  details?: unknown;
  rateLimit?: {
    limit?: number;
    remaining?: number;
    resetAt?: number;
  };
};

/**
 * Successful result returned by `wrapGitHubRest`.
 * - `data` is whatever the underlying github-rest endpoint returned.
 * - `status`/`headers` are included when available from the underlying response.
 */
/**
 * Unified result returned by `wrapGitHubRest`.
 * - `ok` indicates success (`true`) or failure (`false`).
 * - On success `data` will be populated; on failure `response` will contain
 *   normalized error details. `original` preserves the thrown value when
 *   available.
 */
export type GitHubRestResult<T> = {
  ok: boolean;
  status?: number;
  headers?: Record<string, string>;
  rateLimit?: { limit?: number; remaining?: number; resetAt?: number } | undefined;
  data?: T;
  response?: GitHubRestErrorDetails;
  original?: unknown;
};

const DEBUG_MODE = (() => {
  const v = process.env.DEBUG;
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
})();

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    try {
      return String(v);
    } catch {
      return '<unserializable>';
    }
  }
}

function extractRateLimit(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  const limit = headers['x-ratelimit-limit'] ? Number(headers['x-ratelimit-limit']) : undefined;
  const remaining = headers['x-ratelimit-remaining'] ? Number(headers['x-ratelimit-remaining']) : undefined;
  const resetAt = headers['x-ratelimit-reset'] ? Number(headers['x-ratelimit-reset']) * 1000 : undefined;
  return { limit, remaining, resetAt };
}

function normalizeError(e: unknown): GitHubRestErrorDetails {
  // shape-check for github-rest's GitHubError/RateLimitError
  const anyE = e as any;
  if (anyE && typeof anyE === 'object') {
    const message = typeof anyE.message === 'string' ? anyE.message : String(anyE);
    const status = typeof anyE.status === 'number' ? anyE.status : undefined;
    const details = anyE.body ?? anyE.response ?? anyE.errors ?? undefined;
    const headers = (anyE.headers && typeof anyE.headers === 'object') ? anyE.headers as Record<string,string> : undefined;
    const rateLimit = extractRateLimit(headers);
    const code = anyE.code ?? anyE.name ?? undefined;
    return { message, status, headers, code, details, rateLimit };
  }
  return { message: String(e) };
}

/**
 * Wrap a github-rest call so the response and errors are normalized.
 *
 * Usage:
 * await wrapGitHubRest(() => repos.get({ owner, repo }));
 *
 * By default the wrapper returns a `GitHubRestResult<T>` object rather than
 * throwing. Pass `{ throwOnError: true }` to re-throw a normalized Error.
 */
export async function wrapGitHubRest<T>(
  fn: () => Promise<T>,
  opts?: { throwOnError?: boolean }
): Promise<GitHubRestResult<T>> {
  try {
    const data = await fn();
    // Some endpoint helpers may attach metadata (status/headers) to the
    // returned value. Surface those fields in the success result so callers
    // can inspect HTTP-level details when available.
    const anyData = data as any;
    const status = typeof anyData?.status === 'number' ? anyData.status : undefined;
    const headers = (anyData?.headers && typeof anyData.headers === 'object') ? anyData.headers as Record<string,string> : undefined;
    const rateLimit = extractRateLimit(headers);
    const success = { ok: true, status, headers, rateLimit, data } as GitHubRestResult<T>;
    if (DEBUG_MODE) {
      console.log('[github-rest-wrapper] success:', safeStringify({ status, headers, rateLimit, data }));
    }
    return success;
  } catch (err) {
    const normalized = normalizeError(err);
    if (opts?.throwOnError) {
      const thrown = new Error(normalized.message);
      (thrown as any).status = normalized.status;
      (thrown as any).details = normalized.details;
      throw thrown;
    }
    const failure = { ok: false, status: normalized.status, response: normalized, original: err } as GitHubRestResult<T>;
    if (DEBUG_MODE) {
      console.log('[github-rest-wrapper] failure:', safeStringify({ response: normalized, original: (() => {
        try { return err; } catch { return '<unserializable>'; }
      })() }));
    }
    return failure;
  }
}

export default wrapGitHubRest;
