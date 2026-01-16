import type { GitHubClient } from '../core/client.js';

export interface GetUserPrCommentsOptions {
  owner: string;
  repo: string;
  username: string;
  since?: string; // ISO date string
  until?: string; // ISO date string
  fileTypes?: string[]; // e.g. ['.ts', '.js']
  filePaths?: string[]; // e.g. ['src/', 'lib/']
  prState?: 'open' | 'closed' | 'merged';
  perPage?: number;
  maxResults?: number;
}

/**
 * Fetches PR review comments by a user in a repo, with optional filters.
 */
export async function getUserPrComments(
  client: GitHubClient,
  options: GetUserPrCommentsOptions
): Promise<any[]> {
  const { owner, repo, username, since, until, fileTypes, filePaths, prState, perPage = 100, maxResults = 1000 } = options;
  let results: any[] = [];
  let page = 1;
  let fetched = 0;

  while (fetched < maxResults) {
    const data = await client.get<any[]>(`/repos/${owner}/${repo}/pulls/comments`, {
      params: { per_page: perPage, page }
    }).catch(() => []);
    if (!data.length) break;
    let filtered = data.filter((comment: any) => comment.user?.login === username);
    if (since) filtered = filtered.filter((c: any) => c.created_at >= since);
    if (until) filtered = filtered.filter((c: any) => c.created_at <= until);
    if (fileTypes && fileTypes.length) filtered = filtered.filter((c: any) => fileTypes.some(ext => c.path.endsWith(ext)));
    if (filePaths && filePaths.length) filtered = filtered.filter((c: any) => filePaths.some(p => c.path.includes(p)));
    // PR state filter would require extra API calls to check PR state
    results.push(...filtered);
    fetched += data.length;
    if (data.length < perPage) break;
    page++;
  }
  return results.slice(0, maxResults);
}
