import { parseBaseFlags } from '../lib/flags.js';
import * as fs from 'fs';
import {
  getVulnerabilityAlerts,
  listDependabotAlerts,
  listCodeScanningAlerts,
  listSecretScanningAlerts,
  listRepositorySecurityAdvisories
} from 'github-rest';

export async function gatherAlertsCommand(argv: string[]) {
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
      const vulnerabilityAlerts = await getVulnerabilityAlerts(owner, repo);
      const dependabotAlerts = await listDependabotAlerts(owner, repo);
      const codeScanningAlerts = await listCodeScanningAlerts(owner, repo);
      const secretScanningAlerts = await listSecretScanningAlerts(owner, repo);
      const securityAdvisories = await listRepositorySecurityAdvisories(owner, repo);
      results.push({
        owner,
        repo,
        vulnerabilityAlerts,
        dependabotAlerts,
        codeScanningAlerts,
        secretScanningAlerts,
        securityAdvisories,
        status: 'ok'
      });
    } catch (err: any) {
      results.push({ owner, repo, error: err?.message || String(err), status: err?.status || 'error' });
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

export default gatherAlertsCommand;
