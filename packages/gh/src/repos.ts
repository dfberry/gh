import { ghRequest } from './core/request.js';

export interface RepositoryOwner {
  login: string;
  id: number;
  url: string;
  html_url: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  archived: boolean;
  private: boolean;
  owner: RepositoryOwner;
}

export interface SearchReposParams {
  /** Free text to include in the search (repository name, README, etc.) */
  q?: string;
  /** Filter by user (owner) */
  user?: string;
  /** Filter by organization */
  org?: string;
  /** Language qualifier (e.g. "TypeScript") */
  language?: string;
  /** Topic qualifier (single topic) */
  topic?: string;
  /** Stars qualifier (e.g. ">100", "10..50") */
  stars?: string;
  /** Forks qualifier (e.g. ">=10") */
  forks?: string;
  /** Size qualifier (e.g. "<1000") */
  size?: string;
  /** Created qualifier (date ranges) */
  created?: string;
  /** Pushed qualifier (date ranges) */
  pushed?: string;
  /** Include archived repositories */
  archived?: boolean;
  /** Visibility: public or private (applies to org search) */
  visibility?: 'public' | 'private';
  /** GitHub token for authenticated requests (optional) */
  token?: string;
  per_page?: number;
  page?: number;
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated' | 'best match';
  order?: 'asc' | 'desc';
}

export interface SearchReposResult {
  total_count: number;
  incomplete_results: boolean;
  items: Repository[];
}

function addQualifier(parts: string[], key: string, value?: string | boolean) {
  if (value === undefined || value === null) return;
  if (typeof value === 'boolean') {
    parts.push(`${key}:${value}`);
  } else if (value !== '') {
    parts.push(`${key}:${value}`);
  }
}

/**
 * Search repositories using GitHub Search API with a set of convenient filters.
 *
 * Example:
 * await searchRepos({ language: 'TypeScript', stars: '>500', per_page: 10 });
 */
export async function searchRepos(params: SearchReposParams): Promise<SearchReposResult> {
  const {
    q,
    user,
    org,
    language,
    topic,
    stars,
    forks,
    size,
    created,
    pushed,
    archived,
    visibility,
    token,
    per_page = 30,
    page = 1,
    sort,
    order = 'desc',
  } = params;

  const parts: string[] = [];
  if (q) parts.push(q);
  addQualifier(parts, 'user', user);
  addQualifier(parts, 'org', org);
  addQualifier(parts, 'language', language);
  addQualifier(parts, 'topic', topic);
  addQualifier(parts, 'stars', stars);
  addQualifier(parts, 'forks', forks);
  addQualifier(parts, 'size', size);
  addQualifier(parts, 'created', created);
  addQualifier(parts, 'pushed', pushed);
  if (archived !== undefined) addQualifier(parts, 'archived', archived ? 'true' : 'false');
  if (visibility) addQualifier(parts, 'is', visibility);

  if (parts.length === 0) {
    throw new Error('At least one search parameter must be provided');
  }

  const qParam = encodeURIComponent(parts.join(' '));
  const sortParam = sort && sort !== 'best match' ? `&sort=${encodeURIComponent(sort)}` : '';
  const url = `https://api.github.com/search/repositories?q=${qParam}&per_page=${per_page}&page=${page}${sortParam}&order=${order}`;

  return ghRequest<SearchReposResult>(url, { token });
}

export interface ListReposParams {
  per_page?: number;
  page?: number;
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  direction?: 'asc' | 'desc';
  type?: 'all' | 'owner' | 'member'; // for /user/repos
  token?: string;
}

/**
 * List repositories for a given GitHub user (public repos).
 */
export async function listUserRepos(
  username: string,
  params: ListReposParams = {},
): Promise<Repository[]> {
  const { per_page = 30, page = 1, sort, direction, token } = params;
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}`;
  return ghRequest<Repository[]>(url, { token });
}

/**
 * List repositories for a given GitHub organization.
 */
export async function listOrgRepos(
  org: string,
  params: ListReposParams = {},
): Promise<Repository[]> {
  const { per_page = 30, page = 1, sort, direction, token } = params;
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}`;
  return ghRequest<Repository[]>(url, { token });
}

/**
 * List repositories for the authenticated user (requires token).
 */
export async function listAuthenticatedUserRepos(
  params: ListReposParams = {},
): Promise<Repository[]> {
  const { per_page = 30, page = 1, sort, direction, type = 'all', token } = params;
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
  const url = `https://api.github.com/user/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}${typeParam}`;
  if (!token)
    throw new Error(
      'Authentication token is required to list repositories for the authenticated user',
    );
  return ghRequest<Repository[]>(url, { token });
}

/**
 * Helper to fetch all pages for a listing endpoint. Fetches pages until
 * an empty page is received or `maxPages` is reached.
 */
export async function listAllPages(
  fetchPage: (page: number) => Promise<Repository[]>,
  maxPages = 10,
): Promise<Repository[]> {
  const results: Repository[] = [];
  for (let p = 1; p <= maxPages; p++) {
    const pageItems = await fetchPage(p);
    if (!pageItems || pageItems.length === 0) break;
    results.push(...pageItems);
    if (pageItems.length === 0 || pageItems.length < 1) break;
  }
  return results;
}

export async function listAllUserRepos(
  username: string,
  params: Omit<ListReposParams, 'page'> & { maxPages?: number } = {},
): Promise<Repository[]> {
  const { per_page = 100, maxPages = 20, sort, direction, token } = params;
  return listAllPages(
    (page) => listUserRepos(username, { per_page, page, sort, direction, token }),
    maxPages,
  );
}

export async function listAllOrgRepos(
  org: string,
  params: Omit<ListReposParams, 'page'> & { maxPages?: number } = {},
): Promise<Repository[]> {
  const { per_page = 100, maxPages = 20, sort, direction, token } = params;
  return listAllPages(
    (page) => listOrgRepos(org, { per_page, page, sort, direction, token }),
    maxPages,
  );
}

// ---------------------- Pagination + Convenience ----------------------

export interface PaginatedResult<T> {
  items: T[];
  hasNext: boolean;
  nextPage?: number;
  lastPage?: number;
  headers: Record<string, string>;
}

function parseLinkHeader(link: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!link) return map;
  // Link: <https://api.github.com/.../repos?page=3>; rel="next", <...>; rel="last"
  const parts = link.split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) map[m[2]] = m[1];
  }
  return map;
}

function getPageNumberFromUrl(url: string | undefined): number | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const p = u.searchParams.get('page');
    return p ? Number.parseInt(p, 10) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchWithHeaders<T>(
  url: string,
  token?: string,
): Promise<{ data: T; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gh-sdk',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} - ${err}`);
  }
  const data = (await res.json()) as T;
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => (outHeaders[k] = v));
  return { data, headers: outHeaders };
}

export async function listUserReposPaginated(
  username: string,
  params: ListReposParams = {},
): Promise<PaginatedResult<Repository>> {
  const { per_page = 30, page = 1, sort, direction, token } = params;
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}`;
  const { data, headers } = await fetchWithHeaders<Repository[]>(url, token);
  const links = parseLinkHeader(headers['link'] ?? null);
  const nextPage = getPageNumberFromUrl(links['next']);
  const lastPage = getPageNumberFromUrl(links['last']);
  return { items: data, hasNext: !!links['next'], nextPage, lastPage, headers };
}

export async function listOrgReposPaginated(
  org: string,
  params: ListReposParams = {},
): Promise<PaginatedResult<Repository>> {
  const { per_page = 30, page = 1, sort, direction, token } = params;
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}`;
  const { data, headers } = await fetchWithHeaders<Repository[]>(url, token);
  const links = parseLinkHeader(headers['link'] ?? null);
  const nextPage = getPageNumberFromUrl(links['next']);
  const lastPage = getPageNumberFromUrl(links['last']);
  return { items: data, hasNext: !!links['next'], nextPage, lastPage, headers };
}

export async function listAuthenticatedUserReposPaginated(
  params: ListReposParams = {},
): Promise<PaginatedResult<Repository>> {
  const { per_page = 30, page = 1, sort, direction, type = 'all', token } = params;
  if (!token)
    throw new Error(
      'Authentication token is required to list repositories for the authenticated user',
    );
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const dirParam = direction ? `&direction=${encodeURIComponent(direction)}` : '';
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
  const url = `https://api.github.com/user/repos?per_page=${per_page}&page=${page}${sortParam}${dirParam}${typeParam}`;
  const { data, headers } = await fetchWithHeaders<Repository[]>(url, token);
  const links = parseLinkHeader(headers['link'] ?? null);
  const nextPage = getPageNumberFromUrl(links['next']);
  const lastPage = getPageNumberFromUrl(links['last']);
  return { items: data, hasNext: !!links['next'], nextPage, lastPage, headers };
}

/** Convenience: list public repos for a user filtered by language */
export async function listUserReposByLanguage(
  username: string,
  language: string,
  params: Omit<ListReposParams, 'page'> & { maxPages?: number } = {},
): Promise<Repository[]> {
  const per_page = params.per_page ?? 100;
  const maxPages = params.maxPages ?? 20;
  const all = await listAllUserRepos(username, { per_page, maxPages, token: params.token });
  return all.filter((r) => (r.language ?? '').toLowerCase() === language.toLowerCase());
}

/** Convenience: search repos by topic (uses search API) */
export async function searchReposByTopic(
  topic: string,
  params: SearchReposParams = {},
): Promise<SearchReposResult> {
  const q = `${params.q ?? ''} topic:${topic}`.trim();
  return searchRepos({ ...params, q });
}
