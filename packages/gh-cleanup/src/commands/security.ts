import { getBranchProtection, listCollaborators, listRepoSecrets, getAutomatedSecurityFixes } from 'github-rest';
import { describeHelpers } from 'github-rest';
import { getDefaultBranchProtection } from 'github-rest';
export async function gatherSecurityCommand(argv: string[]) {
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
    const repoResult: Record<string, any> = { owner, repo };
    if (branch) {
      try {
        repoResult.branchProtection = await getBranchProtection(owner, repo, branch);
      } catch (err: any) {
        repoResult.branchProtection = { error: err?.message || String(err), status: err?.status || 'error' };
      }
    }
    try {
      repoResult.collaborators = await listCollaborators(owner, repo);
    } catch (err: any) {
      repoResult.collaborators = { error: err?.message || String(err), status: err?.status || 'error' };
    }
    try {
      repoResult.repoSecrets = await listRepoSecrets(owner, repo);
    } catch (err: any) {
      repoResult.repoSecrets = { error: err?.message || String(err), status: err?.status || 'error' };
    }
    try {
      repoResult.automatedSecurityFixes = await getAutomatedSecurityFixes(owner, repo);
    } catch (err: any) {
      repoResult.automatedSecurityFixes = { error: err?.message || String(err), status: err?.status || 'error' };
    }
    results.push(repoResult);
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
import { parseBaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

export async function gatherBranchProtectionCommand(argv: string[]) {
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
    let branchName = branch || null;
    try {
      if (!branchName) {
        // Always try to get the default branch name
        const defaultBranch = await describeHelpers.getDefaultBranch(owner, repo);
        branchName = defaultBranch ?? null;
      }
      let protection = null;
      let status = 'ok';
      let message = undefined;
      if (branchName) {
        try {
          protection = await getBranchProtection(owner, repo, branchName);
        } catch (err: any) {
          if (err?.status === 404 || err?.statusCode === 404) {
            status = 'no-protection';
            message = 'No branch protection enabled';
          } else if (err?.status === 403 || err?.statusCode === 403) {
            status = 'no-access';
            message = 'No access to branch protection';
          } else if (err?.status === 401 || err?.statusCode === 401) {
            status = 'Bad credentials (401)';
            message = err?.message || 'Bad credentials';
          } else {
            status = err?.message || 'error';
            message = err?.message || String(err);
          }
        }
      }
      results.push({ owner, repo, branch: branchName, protection, status, ...(message ? { message } : {}) });
    } catch (err: any) {
      results.push({ owner, repo, branch: branchName, protection: null, message: err?.message || String(err), status: err?.status || 'error' });
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

export async function gatherCollaboratorsCommand(argv: string[]) {
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
      const result = await listCollaborators(owner, repo);
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

export async function gatherRepoSecretsCommand(argv: string[]) {
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
      const result = await listRepoSecrets(owner, repo);
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
