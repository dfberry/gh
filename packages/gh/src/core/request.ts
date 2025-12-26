// src/core/request.ts

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
}

export async function ghRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gh-sdk',
    ...options.headers,
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} - ${error}`);
  }
  return res.json();
}
