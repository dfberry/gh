import { ghRequest } from './core/request.js';

export interface DependabotAlert {
  number: number;
  state: string;
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
    manifest_path: string;
  };
  security_advisory: {
    ghsa_id: string;
    summary: string;
    description: string;
    severity: string;
    identifiers: Array<{ type: string; value: string }>;
  };
  security_vulnerability: {
    package: {
      ecosystem: string;
      name: string;
    };
    severity: string;
    vulnerable_version_range: string;
    first_patched_version: { identifier: string } | null;
  };
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  dismissed_by: { login: string } | null;
  dismissed_reason: string | null;
  dismissed_comment: string | null;
}

export interface GetDependabotAlertsParams {
  owner: string;
  repo: string;
  token: string;
  per_page?: number;
  page?: number;
}

export async function getDependabotAlerts({
  owner,
  repo,
  token,
  per_page = 30,
  page = 1,
}: GetDependabotAlertsParams): Promise<DependabotAlert[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/dependabot/alerts?per_page=${per_page}&page=${page}`;
  return ghRequest<DependabotAlert[]>(url, { token });
}
