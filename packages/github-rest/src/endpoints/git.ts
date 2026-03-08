import type { GitHubClient } from '../core/client.js';

// --- Types ---

export interface GitRef {
  ref: string;
  node_id: string;
  url: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
}

// --- Git Reference Operations ---

/**
 * Get a Git reference.
 * GET /repos/{owner}/{repo}/git/ref/{ref}
 * 
 * @param ref - The ref path without 'refs/' prefix (e.g., 'heads/main', 'tags/v1.0.0')
 */
export async function getRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<GitRef> {
  // Ensure ref doesn't start with 'refs/' as the API path already includes it
  const cleanRef = ref.startsWith('refs/') ? ref.substring(5) : ref;
  return client.get<GitRef>(`/repos/${owner}/${repo}/git/ref/${cleanRef}`);
}

/**
 * Create a Git reference (branch or tag).
 * POST /repos/{owner}/{repo}/git/refs
 * 
 * @param ref - The full ref name including 'refs/' prefix (e.g., 'refs/heads/feature-branch')
 * @param sha - The SHA1 value to set this reference to
 */
export async function createRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
  sha: string,
): Promise<GitRef> {
  return client.post<GitRef>(`/repos/${owner}/${repo}/git/refs`, {
    ref,
    sha,
  });
}

/**
 * Delete a Git reference (branch or tag).
 * DELETE /repos/{owner}/{repo}/git/refs/{ref}
 * 
 * @param ref - The ref path without 'refs/' prefix (e.g., 'heads/feature-branch', 'tags/v1.0.0')
 */
export async function deleteRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<void> {
  // Ensure ref doesn't start with 'refs/' as the API path already includes it
  const cleanRef = ref.startsWith('refs/') ? ref.substring(5) : ref;
  await client.del(`/repos/${owner}/${repo}/git/refs/${cleanRef}`);
}
