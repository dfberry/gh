import { getBranchProtection, listCollaborators, listRepoSecrets, getAutomatedSecurityFixes, describeHelpers } from 'github-rest';
import { getDebugConfig, handleApiError, reportError, extractStatus } from '../lib/debug.js';
import { parseBaseFlags } from '../lib/flags.js';
import * as fs from 'fs';

async function fetchWithStatus(fn: Function, ...args: any[]) {
  const debugConfig = args[args.length - 1];
  const callArgs = args.slice(0, -1);
  const { result, status } = await handleApiError(() => fn(...callArgs), debugConfig);
  return { result, status };
}

export async function gatherSecurityCommand(argv: string[]) {
  const args = parseBaseFlags(argv);
  const { input, out, branch, debug } = args;
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
    const repoResult: Record<string, any> = { owner, repo };
    // Branch protection (optional)
    let branchProtectionStatus = null;
    if (branch) {
      const { result: branchProtection, status } = await fetchWithStatus(getBranchProtection, owner, repo, branch, debugConfig);
      repoResult.branchProtection = branchProtection;
      branchProtectionStatus = status;
    }
    // Collaborators
    const { result: collaborators, status: collabStatus } = await fetchWithStatus(listCollaborators, owner, repo, debugConfig);
    repoResult.collaborators = collaborators;
    // Repo secrets
    const { result: repoSecrets, status: secretsStatus } = await fetchWithStatus(listRepoSecrets, owner, repo, debugConfig);
    repoResult.repoSecrets = repoSecrets;
    // Automated security fixes
    const { result: autoFixes, status: autoFixesStatus } = await fetchWithStatus(getAutomatedSecurityFixes, owner, repo, debugConfig);
    repoResult.automatedSecurityFixes = autoFixes;
    // Compose a single status object summarizing all feature statuses
    const statuses = [branchProtectionStatus, collabStatus, secretsStatus, autoFixesStatus].filter(Boolean);
    const hasError = statuses.some(s => s && s.error);
    repoResult.status = hasError ? { code: 207, message: 'partial-error' } : { code: 200, message: 'ok' };
    results.push(repoResult);
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
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
    let protection = null;
    let status = 'ok';
    let message = undefined;
    let branchProtectionError = null;
    try {
      if (!branchName) {
        // Always try to get the default branch name
        const defaultBranch = await describeHelpers.getDefaultBranch(owner, repo);
        branchName = defaultBranch ?? null;
      }
      if (branchName) {
        try {
          protection = await getBranchProtection(owner, repo, branchName);
          status = 'ok';
        } catch (err: any) {
          protection = null;
          status = extractStatus(err);
          message = err?.message || String(err);
          branchProtectionError = reportError(err, getDebugConfig());
        }
      }
      results.push({ owner, repo, branch: branchName, protection, status, ...(message ? { message } : {}), ...(branchProtectionError ? { branchProtectionError } : {}) });
    } catch (err: any) {
      branchProtectionError = reportError(err, getDebugConfig());
      results.push({ owner, repo, branch: branchName, protection: null, message: err?.message || String(err), status: extractStatus(err), branchProtectionError });
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
    let collaborators = null;
    let status = 'ok';
    let message = undefined;
    let collaboratorsError = null;
    try {
      collaborators = await listCollaborators(owner, repo);
      status = 'ok';
    } catch (err: any) {
      collaborators = null;
      status = extractStatus(err);
      message = err?.message || String(err);
      collaboratorsError = reportError(err, getDebugConfig());
    }
    results.push({ owner, repo, collaborators, status, ...(message ? { message } : {}), ...(collaboratorsError ? { collaboratorsError } : {}) });
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
    let secrets = null;
    let status = 'ok';
    let message = undefined;
    let repoSecretsError = null;
    try {
      secrets = await listRepoSecrets(owner, repo);
      status = 'ok';
    } catch (err: any) {
      secrets = null;
      status = extractStatus(err);
      message = err?.message || String(err);
      repoSecretsError = reportError(err, getDebugConfig());
    }
    results.push({ owner, repo, secrets, status, ...(message ? { message } : {}), ...(repoSecretsError ? { repoSecretsError } : {}) });
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
