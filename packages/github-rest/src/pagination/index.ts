import { GitHubClient } from '../core/client.js';

export async function paginateAll<T>(fn: (page: number) => Promise<T[]>, opts?: { maxPages?: number }) {
  const out: T[] = [];
  let page = 1;
  const perLoopMax = opts?.maxPages ?? Infinity;
  while (page <= perLoopMax) {
    const items = await fn(page);
    if (!items || items.length === 0) break;
    out.push(...items);
    page += 1;
  }
  return out;
}
