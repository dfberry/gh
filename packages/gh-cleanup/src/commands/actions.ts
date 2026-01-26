

import { fetchRepoActions } from 'github-rest';
import { parseBaseFlags } from '../lib/flags.js';
import { getDebugConfig, handleApiError } from '../lib/debug.js';
import * as fs from 'fs';

async function fetchActionsWithStatus(owner: string, repo: string, debugConfig: any) {
  const { result, status } = await handleApiError(() => fetchRepoActions(owner, repo), debugConfig);
  return { result, status };
}

export async function gatherActionsCommand(argv: string[]) {
  const args = parseBaseFlags(argv);
  const { input, out, debug } = args;
  const debugConfig = getDebugConfig(debug);
  if (!input || !out) throw new Error('Missing --input or --out');
  const raw = fs.readFileSync(input, 'utf8');
  let repos: string[] = [];
  try {
    repos = JSON.parse(raw);
  } catch {
    repos = raw.split('\n').map(x => x.trim()).filter(Boolean);
  }
  const results = [];
  for (const repoFull of repos) {
    const [owner, repo] = repoFull.split('/');
    const { result: actions, status } = await fetchActionsWithStatus(owner, repo, debugConfig);
    results.push({ owner, repo, actions, status });
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
