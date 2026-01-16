import { fetchBranchProtection, fetchCollaborators, fetchRepoSecrets } from '../../../github-rest/dist/endpoints/permissions.js';
import { parseBaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

export async function branchProtectionCommand(argv: string[]) {
  const args = parseBaseFlags(argv);
  const { input, out, branch } = args;
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
    let branchName = branch;
    // If no branch provided, skip (should not happen with orchestrator logic)
    if (!branchName) {
      results.push({ owner, repo, branch: null, protection: null, message: 'No branch specified', status: 'skipped' });
      continue;
    }
    try {
      const result = await fetchBranchProtection(owner, repo, branchName);
      results.push({ owner, repo, branch: branchName, protection: result, status: 'ok' });
    } catch (err: any) {
      if (err && (err.status === 404 || err.statusCode === 404)) {
        results.push({ owner, repo, branch: branchName, protection: null, message: 'No branch protection enabled', status: 404 });
      } else {
        results.push({ owner, repo, branch: branchName, protection: null, message: err?.message || String(err), status: err?.status || 'error' });
      }
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

export async function collaboratorsCommand(argv: string[]) {
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
      const result = await fetchCollaborators(owner, repo);
      results.push({ owner, repo, collaborators: result, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, collaborators: null, message, status: err?.status || 'error' });
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

export async function repoSecretsCommand(argv: string[]) {
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
      const result = await fetchRepoSecrets(owner, repo);
      results.push({ owner, repo, secrets: result, status: 'ok' });
    } catch (err: any) {
      let message = err?.message || String(err);
      if (err && (err.status === 403 || err.statusCode === 403)) {
        let apiMsg = '';
        if (err.body && err.body.message) apiMsg = err.body.message;
        message = `Insufficient permissions or access denied. ${apiMsg ? 'GitHub: ' + apiMsg : ''}`;
      }
      results.push({ owner, repo, secrets: null, message, status: err?.status || 'error' });
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
