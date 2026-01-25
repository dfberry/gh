import * as fs from 'fs/promises';
import { user as userEndpoints } from 'github-rest';
import type { GitHubClient } from 'github-rest';

export async function fetchAndWriteTokenScopes(
  client: GitHubClient,
  outDir: string,
  outPrefix: string,
  writer?: (path: string, data: unknown) => Promise<void>,
): Promise<string[]> {
  try {
    const scopes = await userEndpoints.getUserTokenPermissions(client);
    const scopesFile = `${outDir}/${outPrefix}-token-scopes.json`;
    const write =
      writer ??
      (async (p: string, d: unknown) => {
        await fs.writeFile(p, JSON.stringify(d, null, 2), 'utf8');
      });
    try {
      await write(scopesFile, { scopes });
    } catch (e) {
      console.error(`Failed to write token scopes file "${scopesFile}":`, e);
    }
    return scopes;
  } catch (e) {
    return [];
  }
}

export default fetchAndWriteTokenScopes;
