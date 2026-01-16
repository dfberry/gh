import { parseRepoInput } from './input-parser.js';
import { repos } from 'github-rest';

/**
 * If `inputPath` is provided, fetch repo metadata for each fullname in the
 * input file (JSON array or newline-separated). Returns `undefined` when no
 * inputPath was provided so callers can fall back to their default behavior.
 */
export async function resolveReposFromInput(client: any, inputPath?: string): Promise<any[] | undefined> {
  if (!inputPath) return undefined;
  const names = parseRepoInput(inputPath);
  const out: any[] = [];
  for (const full of names) {
    const [owner, name] = full.split('/');
    if (!owner || !name) {
      console.warn(`Skipping invalid repo name from input: ${full}`);
      continue;
    }
    try {
      const r = await repos.getRepo(client, owner, name);
      out.push(r);
    } catch (e: any) {
      console.warn(`Failed to fetch repo ${full}:`, e?.message ?? e);
    }
  }
  return out;
}

/**
 * Policy describing whether callers allow falling back to listing the
 * authenticated user's repos when no explicit input file is provided.
 */
export type RepoInputPolicy = {
  allowUserFallback: boolean; // when false, caller requires an explicit input file
};

/**
 * Resolve repos according to the provided policy. Returns an array of
 * repo objects when resolved, or `undefined` when the policy forbids
 * fallback and no `inputPath` was provided (caller should treat as error).
 */
export async function resolveReposWithPolicy(client: any, inputPath?: string, policy: RepoInputPolicy = { allowUserFallback: true }): Promise<any[] | undefined> {
  if (inputPath) {
    const resolved = await resolveReposFromInput(client, inputPath);
    return resolved ?? [];
  }

  if (!policy.allowUserFallback) {
    // Caller explicitly disallows falling back to listing user repos.
    return undefined;
  }

  return await fetchActiveRepos(client, undefined);
}

export async function fetchActiveRepos(client: any, inputPath?: string): Promise<any[]> {
  // If inputPath provided, resolve repos from that file
  if (inputPath) {
    const resolved = await resolveReposFromInput(client, inputPath);
    return resolved ?? [];
  }

  // otherwise list authenticated user's repos and filter active (not archived, not fork)
  let me: string | undefined;
  try {
    const u = await client.getAuthenticatedUser();
    me = (u as any).login;
  } catch (e) {
    me = undefined;
  }
  const { pagination } = await import('github-rest');
  const all = await pagination.paginateAll(async (page: number) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });
  const active = all.filter((r: any) => {
    if (r.archived) return false;
    if (r.fork) return false;
    // if we can, prefer repos owned by the authenticated user
    if (me && r.owner?.login !== me) return false;
    return true;
  });
  return active;
}

// exported helpers: `resolveReposFromInput` and `categorizeReposWithMetadata`
import { GitHubClient } from 'github-rest';
import { Categorized } from './report.js';
import { scoreCategory } from './categorizer.js';

export type RepoInput = any;

export type CategorizeOptions = {
  fetch?: boolean;
  providedRules?: any[];
};

export async function categorizeReposWithMetadata(client: GitHubClient, repos: RepoInput[], opts: CategorizeOptions = {}): Promise<Categorized[]> {
  const results: Categorized[] = [];
  for (const r of repos) {
    let languages: Record<string, number> | null = null;
    let readmeText: string | null = null;
    let ghRepo: any = null;
    try {
      if (opts.fetch) {
        const gh = (await import('github-rest')) as any;
        languages = await gh.repos.getRepoLanguages(client, r.owner.login, r.name);
        readmeText = await gh.repos.getRepoReadme(client, r.owner.login, r.name);
        try {
          ghRepo = await gh.repos.getRepo(client, r.owner.login, r.name);
        } catch (e) {
          ghRepo = null;
        }
      }
    } catch (e) {
      languages = null;
      readmeText = null;
    }

    const { category, confidence } = await scoreCategory(r, languages, readmeText, (r as any).topics, opts.providedRules);
    results.push({
      full_name: r.full_name,
      html_url: r.html_url,
      description: (r as any).description ?? null,
      language: r.language ?? null,
      topics: (r as any).topics,
      category,
      confidence,
      last_updated: r.pushed_at ?? null,
      stars: (r as any).stargazers_count ?? null,
      archived: (r as any).archived ?? false,
      fork: (r as any).fork ?? false,
      template: (r as any).template ?? (r as any).has_template ?? false,
      private: (ghRepo && typeof ghRepo.private !== 'undefined') ? ghRepo.private : (r as any).private ?? false,
      visibility: (ghRepo && typeof ghRepo.visibility !== 'undefined') ? ghRepo.visibility : (r as any).visibility ?? ((r as any).private ? 'private' : 'public'),
    });
  }
  return results;
}

// no default export — use named exports
