
import { parseBaseFlags } from '../lib/flags.js';
import { getDebugConfig, handleApiError } from '../lib/debug.js';
import * as fs from 'fs';
import {
  getVulnerabilityAlerts,
  listDependabotAlerts,
  listCodeScanningAlerts,
  listSecretScanningAlerts,
  listRepositorySecurityAdvisories
} from 'github-rest';

async function fetchAlertWithStatus(fn: Function, owner: string, repo: string, debugConfig: any) {
  const { result, status } = await handleApiError(() => fn(owner, repo), debugConfig);
  return { result, status };
}

export async function gatherAlertsCommand(argv: string[]) {
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
    const alertResults: any = { owner, repo };
    const alertTypes = [
      { key: 'vulnerabilityAlerts', fn: getVulnerabilityAlerts },
      { key: 'dependabotAlerts', fn: listDependabotAlerts },
      { key: 'codeScanningAlerts', fn: listCodeScanningAlerts },
      { key: 'secretScanningAlerts', fn: listSecretScanningAlerts },
      { key: 'securityAdvisories', fn: listRepositorySecurityAdvisories }
    ];
    for (const { key, fn } of alertTypes) {
      const { result, status } = await fetchAlertWithStatus(fn, owner, repo, debugConfig);
      alertResults[key] = result;
      alertResults[`${key}Status`] = status;
    }
    // Compose a single status object summarizing all alert statuses
    const allStatuses = alertTypes.map(({ key }) => alertResults[`${key}Status`]);
    const hasError = allStatuses.some(s => s && s.error);
    alertResults.status = hasError ? { code: 207, message: 'partial-error' } : { code: 200, message: 'ok' };
    results.push(alertResults);
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
