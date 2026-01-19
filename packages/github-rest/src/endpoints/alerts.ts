
import { GitHubClient } from '../core/client.js';

export async function getVulnerabilityAlerts(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/vulnerability-alerts`;
  return client.get(path);
}

// List Dependabot alerts for a repository
// https://docs.github.com/en/rest/dependabot/alerts?apiVersion=2022-11-28#list-dependabot-alerts-for-a-repository

export async function listDependabotAlerts(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/dependabot/alerts`;
  return client.get(path);
}

// List code scanning alerts for a repository
// https://docs.github.com/en/rest/code-scanning/alerts?apiVersion=2022-11-28#list-code-scanning-alerts-for-a-repository

export async function listCodeScanningAlerts(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/code-scanning/alerts`;
  return client.get(path);
}

// List secret scanning alerts for a repository
// https://docs.github.com/en/rest/secret-scanning/secret-scanning?apiVersion=2022-11-28#list-secret-scanning-alerts-for-a-repository

export async function listSecretScanningAlerts(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/secret-scanning/alerts`;
  return client.get(path);
}

// List repository security advisories
// https://docs.github.com/en/rest/security-advisories/repository-advisories?apiVersion=2022-11-28#list-repository-security-advisories

export async function listRepositorySecurityAdvisories(client: GitHubClient, owner: string, repo: string) {
  const path = `/repos/${owner}/${repo}/security-advisories`;
  return client.get(path);
}