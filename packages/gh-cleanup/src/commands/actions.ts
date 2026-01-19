import { fetchRepoActions } from 'github-rest';
import { parseBaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

export async function gatherActionsCommand(argv: string[]) {
  const args = parseBaseFlags(argv);
  const { input, out } = args;
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
    try {
      const result = await fetchRepoActions(owner, repo);
      results.push({ owner, repo, actions: result, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, actions: null, message, status: err?.status || 'error' });
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
