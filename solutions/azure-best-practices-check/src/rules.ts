/**
 * Rules — pure check functions for Azure best practices.
 * 15 checks across 5 dimensions, weights sum to 100.
 * NO API calls. Each takes pre-fetched data and returns an AzureBPCheckResult.
 */

import type { AzureBPCheckResult, PackageJsonData, RepoFileData } from './types.js';

// ─── Regex patterns ───────────────────────────────────────────────────────────

const DEPRECATED_SDK_PACKAGES = [
  'azure-storage', 'azure-sb', 'ms-rest-azure', 'azure-arm-resource',
  'azure-arm-storage', 'azure-arm-network', 'azure-arm-compute',
  'azure-arm-website', 'azure-arm-keyvault',
];

const SECRET_LITERAL_PATTERN = /(?:password|secret|key|connectionstring)\s*[:=]\s*['"][^'"]{8,}['"]/gi;

const CONNECTION_STRING_PATTERN = /(?:DefaultEndpointsProtocol=|AccountKey=|Endpoint=sb:\/\/|Server=tcp:.*Password=)/gi;

// ─── azure-sdk dimension (25 pts) ─────────────────────────────────────────────

export function checkAzureIdentityPresent(packageJson: PackageJsonData): AzureBPCheckResult {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const hasAzureDeps = Object.keys(deps).some(k => k.startsWith('@azure/'));
  const hasIdentity = '@azure/identity' in deps;

  const passed = !hasAzureDeps || hasIdentity;
  return {
    dimension: 'azure-sdk',
    signal: 'azure-identity-present',
    passed,
    severity: 'high',
    weight: 8,
    earned: passed ? 8 : 0,
    detail: passed
      ? hasAzureDeps ? '@azure/identity present' : 'No Azure SDK deps (N/A)'
      : 'Uses @azure/ packages but missing @azure/identity — likely hardcoding credentials',
    recommendation: passed ? undefined : 'Add @azure/identity and use DefaultAzureCredential for authentication',
  };
}

export function checkNoDeprecatedAzureSDK(packageJson: PackageJsonData): AzureBPCheckResult {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const deprecated = Object.keys(deps).filter(k =>
    DEPRECATED_SDK_PACKAGES.some(d => k === d || k.startsWith(`${d}/`)),
  );

  const passed = deprecated.length === 0;
  return {
    dimension: 'azure-sdk',
    signal: 'no-deprecated-azure-sdk',
    passed,
    severity: 'medium',
    weight: 7,
    earned: passed ? 7 : 0,
    detail: passed
      ? 'No deprecated Azure SDK packages found'
      : `Deprecated packages found: ${deprecated.join(', ')}`,
    recommendation: passed ? undefined : 'Migrate to @azure/ scoped packages (Azure SDK v2+)',
  };
}

export function checkUsesModernAzureSDK(packageJson: PackageJsonData): AzureBPCheckResult {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const depKeys = Object.keys(deps);

  const oldStyleAzure = depKeys.filter(k =>
    k.startsWith('azure-') && !k.startsWith('azure-devops'),
  );
  const modernAzure = depKeys.filter(k => k.startsWith('@azure/'));
  const hasAnyAzure = oldStyleAzure.length > 0 || modernAzure.length > 0;
  const passed = !hasAnyAzure || (oldStyleAzure.length === 0 && modernAzure.length > 0);

  return {
    dimension: 'azure-sdk',
    signal: 'uses-modern-azure-sdk',
    passed,
    severity: 'medium',
    weight: 6,
    earned: passed ? 6 : 0,
    detail: passed
      ? hasAnyAzure ? `Using ${modernAzure.length} modern @azure/ package(s)` : 'No Azure SDK deps (N/A)'
      : `${oldStyleAzure.length} old-style azure-* package(s): ${oldStyleAzure.slice(0, 3).join(', ')}`,
    recommendation: passed ? undefined : 'Replace azure-* packages with their @azure/ equivalents',
  };
}

export function checkAzureTypesPresent(packageJson: PackageJsonData): AzureBPCheckResult {
  const devDeps = packageJson.devDependencies ?? {};
  const allDeps = { ...packageJson.dependencies, ...devDeps };

  const hasAzureDeps = Object.keys(allDeps).some(k => k.startsWith('@azure/'));
  const hasTypeScript = 'typescript' in devDeps || '@types/node' in devDeps;
  const hasAzureDevDeps = Object.keys(devDeps).some(k => k.startsWith('@azure/'));

  // Pass if: no Azure deps, OR has TypeScript with Azure deps, OR has Azure devDeps
  const passed = !hasAzureDeps || hasTypeScript || hasAzureDevDeps;
  return {
    dimension: 'azure-sdk',
    signal: 'azure-types-present',
    passed,
    severity: 'low',
    weight: 4,
    earned: passed ? 4 : 0,
    detail: passed
      ? hasAzureDeps
        ? 'TypeScript / Azure type support present'
        : 'No Azure SDK deps (N/A)'
      : 'Azure SDK used without TypeScript or type definitions',
    recommendation: passed ? undefined : 'Add TypeScript and @azure/ type definitions for better developer experience',
  };
}

// ─── iac dimension (25 pts) ───────────────────────────────────────────────────

export function checkIaCPresent(data: RepoFileData): AzureBPCheckResult {
  const iacIndicators = data.rootEntries.filter(e =>
    e.name.endsWith('.bicep') ||
    e.name.endsWith('.tf') ||
    e.name === 'azuredeploy.json' ||
    e.name === 'main.bicep' ||
    (e.name === 'infra' && e.type === 'dir'),
  );

  const passed = iacIndicators.length > 0 || data.iacFiles.length > 0;
  return {
    dimension: 'iac',
    signal: 'iac-present',
    passed,
    severity: 'medium',
    weight: 8,
    earned: passed ? 8 : 0,
    detail: passed
      ? `IaC files found: ${iacIndicators.map(e => e.name).join(', ') || data.iacFiles.map(f => f.path).join(', ')}`
      : 'No IaC files found (Bicep, Terraform, or ARM templates)',
    recommendation: passed ? undefined : 'Add infrastructure-as-code (Bicep recommended) for repeatable deployments',
  };
}

export function checkIaCNoHardcodedSecrets(iacFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (iacFiles.length === 0) {
    return {
      dimension: 'iac',
      signal: 'iac-no-hardcoded-secrets',
      passed: true,
      severity: 'critical',
      weight: 10,
      earned: 10,
      detail: 'No IaC files to check (N/A)',
    };
  }

  const findings: string[] = [];
  for (const file of iacFiles) {
    const matches = file.content.match(SECRET_LITERAL_PATTERN);
    if (matches) {
      findings.push(`${file.path}: ${matches.length} potential secret(s)`);
    }
  }

  const passed = findings.length === 0;
  return {
    dimension: 'iac',
    signal: 'iac-no-hardcoded-secrets',
    passed,
    severity: 'critical',
    weight: 10,
    earned: passed ? 10 : 0,
    detail: passed
      ? 'No hardcoded secrets found in IaC files'
      : `Potential hardcoded secrets: ${findings.join('; ')}`,
    recommendation: passed ? undefined : 'Use parameters/variables with @secure() decorator (Bicep) or sensitive flag (Terraform) instead of hardcoded secrets',
  };
}

export function checkIaCParameterized(iacFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (iacFiles.length === 0) {
    return {
      dimension: 'iac',
      signal: 'iac-parameterized',
      passed: true,
      severity: 'medium',
      weight: 7,
      earned: 7,
      detail: 'No IaC files to check (N/A)',
    };
  }

  let paramCount = 0;
  for (const file of iacFiles) {
    if (file.path.endsWith('.bicep')) {
      const paramMatches = file.content.match(/^param\s+/gm);
      paramCount += paramMatches?.length ?? 0;
    } else if (file.path.endsWith('.tf')) {
      const varMatches = file.content.match(/^variable\s+/gm);
      paramCount += varMatches?.length ?? 0;
    } else if (file.path.endsWith('.json')) {
      // ARM template parameters
      if (file.content.includes('"parameters"')) paramCount++;
    }
  }

  const passed = paramCount > 0;
  return {
    dimension: 'iac',
    signal: 'iac-parameterized',
    passed,
    severity: 'medium',
    weight: 7,
    earned: passed ? 7 : 0,
    detail: passed
      ? `${paramCount} parameter/variable declaration(s) found in IaC`
      : 'IaC files have no parameters or variables — likely hardcoded values',
    recommendation: passed ? undefined : 'Add param (Bicep) or variable (Terraform) declarations for configurable deployments',
  };
}

// ─── config dimension (15 pts) ────────────────────────────────────────────────

export function checkAzdYamlPresent(data: RepoFileData): AzureBPCheckResult {
  const passed = data.hasAzureYaml;
  return {
    dimension: 'config',
    signal: 'azd-yaml-present',
    passed,
    severity: 'low',
    weight: 4,
    earned: passed ? 4 : 0,
    detail: passed
      ? 'azure.yaml found — Azure Developer CLI ready'
      : 'No azure.yaml — not Azure Developer CLI enabled',
    recommendation: passed ? undefined : 'Add azure.yaml to enable `azd up` for one-command deployment',
  };
}

export function checkEnvExamplePresent(data: RepoFileData): AzureBPCheckResult {
  const passed = data.hasEnvExample;
  return {
    dimension: 'config',
    signal: 'env-example-present',
    passed,
    severity: 'medium',
    weight: 6,
    earned: passed ? 6 : 0,
    detail: passed
      ? '.env.example or .env.sample found — environment variables documented'
      : 'No .env.example or .env.sample — required environment variables undocumented',
    recommendation: passed ? undefined : 'Add .env.example listing all required environment variables (without values)',
  };
}

export function checkSecurityPolicyPresent(data: RepoFileData): AzureBPCheckResult {
  const passed = data.hasSecurityPolicy;
  return {
    dimension: 'config',
    signal: 'security-policy-present',
    passed,
    severity: 'low',
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed
      ? 'SECURITY.md or security policy found'
      : 'No SECURITY.md or security policy found',
    recommendation: passed ? undefined : 'Add SECURITY.md with vulnerability reporting instructions',
  };
}

// ─── ci-cd dimension (20 pts) ─────────────────────────────────────────────────

export function checkWorkflowFederatedAuth(workflowFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (workflowFiles.length === 0) {
    return {
      dimension: 'ci-cd',
      signal: 'workflow-federated-auth',
      passed: true,
      severity: 'high',
      weight: 8,
      earned: 8,
      detail: 'No workflow files to check (N/A)',
    };
  }

  // Look for azure/login@ with client-id (OIDC/federated), not creds
  let usesFederated = false;
  for (const file of workflowFiles) {
    const hasAzureLogin = /azure\/login@/i.test(file.content);
    const hasClientId = /client-id/i.test(file.content);
    if (hasAzureLogin && hasClientId) {
      usesFederated = true;
      break;
    }
  }

  // Only fail if workflows use azure/login without federated auth
  const hasAzureLogin = workflowFiles.some(f => /azure\/login@/i.test(f.content));
  const passed = !hasAzureLogin || usesFederated;

  return {
    dimension: 'ci-cd',
    signal: 'workflow-federated-auth',
    passed,
    severity: 'high',
    weight: 8,
    earned: passed ? 8 : 0,
    detail: passed
      ? hasAzureLogin
        ? 'Workflows use OIDC/federated auth with azure/login'
        : 'No Azure login actions found (N/A)'
      : 'Workflows use azure/login without federated (OIDC) authentication',
    recommendation: passed ? undefined : 'Switch to OIDC/federated credentials: use client-id, tenant-id, and subscription-id instead of creds',
  };
}

export function checkWorkflowNoHardcodedCreds(workflowFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (workflowFiles.length === 0) {
    return {
      dimension: 'ci-cd',
      signal: 'workflow-no-hardcoded-creds',
      passed: true,
      severity: 'critical',
      weight: 7,
      earned: 7,
      detail: 'No workflow files to check (N/A)',
    };
  }

  const findings: string[] = [];
  for (const file of workflowFiles) {
    // Check for inline AZURE_CREDENTIALS with JSON
    if (/AZURE_CREDENTIALS/i.test(file.content) && /\{.*clientId.*\}/is.test(file.content)) {
      findings.push(`${file.path}: inline AZURE_CREDENTIALS JSON`);
    }
    // Check for hardcoded keys/secrets in workflow env
    const secretMatches = file.content.match(/(?:password|secret|key)\s*:\s*['"][^$'"]{8,}['"]/gi);
    if (secretMatches) {
      findings.push(`${file.path}: ${secretMatches.length} hardcoded credential(s)`);
    }
  }

  const passed = findings.length === 0;
  return {
    dimension: 'ci-cd',
    signal: 'workflow-no-hardcoded-creds',
    passed,
    severity: 'critical',
    weight: 7,
    earned: passed ? 7 : 0,
    detail: passed
      ? 'No hardcoded credentials found in workflow files'
      : `Hardcoded credentials: ${findings.join('; ')}`,
    recommendation: passed ? undefined : 'Use GitHub Actions secrets (${{ secrets.X }}) or OIDC — never inline credentials in workflow files',
  };
}

export function checkWorkflowCurrentActions(workflowFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (workflowFiles.length === 0) {
    return {
      dimension: 'ci-cd',
      signal: 'workflow-current-actions',
      passed: true,
      severity: 'medium',
      weight: 5,
      earned: 5,
      detail: 'No workflow files to check (N/A)',
    };
  }

  const deprecatedActions: string[] = [];
  for (const file of workflowFiles) {
    const v1Matches = file.content.match(/azure\/login@v1/gi);
    if (v1Matches) {
      deprecatedActions.push(`${file.path}: azure/login@v1`);
    }
    const oldWebapps = file.content.match(/azure\/webapps-deploy@v1/gi);
    if (oldWebapps) {
      deprecatedActions.push(`${file.path}: azure/webapps-deploy@v1`);
    }
  }

  const passed = deprecatedActions.length === 0;
  return {
    dimension: 'ci-cd',
    signal: 'workflow-current-actions',
    passed,
    severity: 'medium',
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed
      ? 'All Azure GitHub Actions are current versions'
      : `Deprecated action versions: ${deprecatedActions.join('; ')}`,
    recommendation: passed ? undefined : 'Update Azure GitHub Actions to latest versions (azure/login@v2, azure/webapps-deploy@v3)',
  };
}

// ─── security dimension (15 pts) ──────────────────────────────────────────────

export function checkNoConnectionStringsInSource(sourceFiles: Array<{ path: string; content: string }>): AzureBPCheckResult {
  if (sourceFiles.length === 0) {
    return {
      dimension: 'security',
      signal: 'no-connection-strings-in-source',
      passed: true,
      severity: 'critical',
      weight: 10,
      earned: 10,
      detail: 'No source files to check (N/A)',
    };
  }

  const findings: string[] = [];
  for (const file of sourceFiles) {
    const matches = file.content.match(CONNECTION_STRING_PATTERN);
    if (matches) {
      findings.push(`${file.path}: ${matches.length} connection string pattern(s)`);
    }
  }

  const passed = findings.length === 0;
  return {
    dimension: 'security',
    signal: 'no-connection-strings-in-source',
    passed,
    severity: 'critical',
    weight: 10,
    earned: passed ? 10 : 0,
    detail: passed
      ? 'No connection strings found in source files'
      : `Connection strings in source: ${findings.join('; ')}`,
    recommendation: passed ? undefined : 'Use environment variables or Azure Key Vault — never commit connection strings to source',
  };
}

export function checkManagedIdentityDocumented(readmeContent: string | null): AzureBPCheckResult {
  if (!readmeContent) {
    return {
      dimension: 'security',
      signal: 'managed-identity-documented',
      passed: false,
      severity: 'low',
      weight: 5,
      earned: 0,
      detail: 'No README to check for managed identity documentation',
      recommendation: 'Add README.md documenting authentication approach (managed identity or DefaultAzureCredential preferred)',
    };
  }

  const lower = readmeContent.toLowerCase();
  const passed = lower.includes('managed identity') ||
    lower.includes('defaultazurecredential') ||
    lower.includes('managed-identity') ||
    lower.includes('workload identity');

  return {
    dimension: 'security',
    signal: 'managed-identity-documented',
    passed,
    severity: 'low',
    weight: 5,
    earned: passed ? 5 : 0,
    detail: passed
      ? 'README documents managed identity or DefaultAzureCredential usage'
      : 'README does not mention managed identity or DefaultAzureCredential',
    recommendation: passed ? undefined : 'Document managed identity or DefaultAzureCredential usage in README for passwordless auth guidance',
  };
}

/** All rule function names for reference */
export const ALL_RULES = [
  'checkAzureIdentityPresent',
  'checkNoDeprecatedAzureSDK',
  'checkUsesModernAzureSDK',
  'checkAzureTypesPresent',
  'checkIaCPresent',
  'checkIaCNoHardcodedSecrets',
  'checkIaCParameterized',
  'checkAzdYamlPresent',
  'checkEnvExamplePresent',
  'checkSecurityPolicyPresent',
  'checkWorkflowFederatedAuth',
  'checkWorkflowNoHardcodedCreds',
  'checkWorkflowCurrentActions',
  'checkNoConnectionStringsInSource',
  'checkManagedIdentityDocumented',
] as const;
