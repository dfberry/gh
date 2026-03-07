/**
 * rules.test.ts — Tests ALL 15 Azure best-practices rules as pure functions.
 *
 * Each rule is tested for:
 *   ✅ Pass case (condition met)
 *   ❌ Fail case (condition not met)
 *   🔲 Edge case (e.g., no Azure deps → N/A for identity check)
 *   📋 Contract: correct dimension, signal, severity, weight, earned, passed
 *
 * Rules are pure — no mocks needed.
 */

import { describe, it, expect } from 'vitest';

import {
  checkAzureIdentityPresent,
  checkNoDeprecatedAzureSDK,
  checkUsesModernAzureSDK,
  checkAzureTypesPresent,
  checkIaCPresent,
  checkIaCNoHardcodedSecrets,
  checkIaCParameterized,
  checkAzdYamlPresent,
  checkEnvExamplePresent,
  checkSecurityPolicyPresent,
  checkWorkflowFederatedAuth,
  checkWorkflowNoHardcodedCreds,
  checkWorkflowCurrentActions,
  checkNoConnectionStringsInSource,
  checkManagedIdentityDocumented,
  ALL_RULES,
} from './rules.js';

import type { PackageJsonData, RepoFileData } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepoFileData(overrides: Partial<RepoFileData> = {}): RepoFileData {
  return {
    rootEntries: [],
    packageJson: null,
    iacFiles: [],
    workflowFiles: [],
    readmeContent: null,
    hasEnvExample: false,
    hasSecurityPolicy: false,
    hasAzureYaml: false,
    ...overrides,
  };
}

// ─── Completeness Check ──────────────────────────────────────────────────────

describe('ALL_RULES', () => {
  it('should enumerate exactly 15 rule names', () => {
    expect(ALL_RULES).toHaveLength(15);
  });

  it('should include all check function names', () => {
    expect(ALL_RULES).toContain('checkAzureIdentityPresent');
    expect(ALL_RULES).toContain('checkNoDeprecatedAzureSDK');
    expect(ALL_RULES).toContain('checkUsesModernAzureSDK');
    expect(ALL_RULES).toContain('checkAzureTypesPresent');
    expect(ALL_RULES).toContain('checkIaCPresent');
    expect(ALL_RULES).toContain('checkIaCNoHardcodedSecrets');
    expect(ALL_RULES).toContain('checkIaCParameterized');
    expect(ALL_RULES).toContain('checkAzdYamlPresent');
    expect(ALL_RULES).toContain('checkEnvExamplePresent');
    expect(ALL_RULES).toContain('checkSecurityPolicyPresent');
    expect(ALL_RULES).toContain('checkWorkflowFederatedAuth');
    expect(ALL_RULES).toContain('checkWorkflowNoHardcodedCreds');
    expect(ALL_RULES).toContain('checkWorkflowCurrentActions');
    expect(ALL_RULES).toContain('checkNoConnectionStringsInSource');
    expect(ALL_RULES).toContain('checkManagedIdentityDocumented');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AZURE-SDK DIMENSION (weight budget: 25)
// ═══════════════════════════════════════════════════════════════════════════════

describe('azure-sdk dimension', () => {

  // ─── 1a. checkAzureIdentityPresent (weight: 8, severity: high) ────────────

  describe('checkAzureIdentityPresent', () => {
    it('should PASS when @azure/identity is present alongside @azure/ deps', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          '@azure/storage-blob': '^12.0.0',
          '@azure/identity': '^4.0.0',
        },
      };
      const result = checkAzureIdentityPresent(pkg);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('azure-sdk');
      expect(result.signal).toBe('azure-identity-present');
      expect(result.severity).toBe('high');
      expect(result.weight).toBe(8);
      expect(result.earned).toBe(8);
    });

    it('should FAIL when @azure/ deps exist but @azure/identity is missing', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          '@azure/storage-blob': '^12.0.0',
          '@azure/cosmos': '^4.0.0',
        },
      };
      const result = checkAzureIdentityPresent(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.weight).toBe(8);
      expect(result.severity).toBe('high');
      expect(result.detail).toBeTruthy();
      expect(result.recommendation).toBeTruthy();
    });

    it('should PASS (N/A) when no @azure/ dependencies exist at all', () => {
      const pkg: PackageJsonData = {
        dependencies: { express: '^4.0.0' },
      };
      const result = checkAzureIdentityPresent(pkg);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
      expect(result.detail).toMatch(/N\/A|no azure/i);
    });

    it('should check devDependencies as well as dependencies', () => {
      const pkg: PackageJsonData = {
        devDependencies: {
          '@azure/storage-blob': '^12.0.0',
        },
      };
      const result = checkAzureIdentityPresent(pkg);

      // Has @azure/ deps but no @azure/identity → fail
      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should handle empty package.json (no deps)', () => {
      const pkg: PackageJsonData = {};
      const result = checkAzureIdentityPresent(pkg);

      // No Azure deps → N/A → pass
      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });
  });

  // ─── 1b. checkNoDeprecatedAzureSDK (weight: 7, severity: medium) ────────

  describe('checkNoDeprecatedAzureSDK', () => {
    it('should PASS when no deprecated SDK packages are found', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          '@azure/storage-blob': '^12.0.0',
          '@azure/identity': '^4.0.0',
        },
      };
      const result = checkNoDeprecatedAzureSDK(pkg);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('azure-sdk');
      expect(result.signal).toBe('no-deprecated-azure-sdk');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(7);
      expect(result.earned).toBe(7);
    });

    it('should FAIL when azure-storage (v1 SDK) is present', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          'azure-storage': '^2.0.0',
        },
      };
      const result = checkNoDeprecatedAzureSDK(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.detail).toMatch(/deprecated|azure-storage/i);
    });

    it('should FAIL when azure-sb (deprecated service bus) is present', () => {
      const pkg: PackageJsonData = {
        dependencies: { 'azure-sb': '^0.11.0' },
      };
      const result = checkNoDeprecatedAzureSDK(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should FAIL when ms-rest-azure (v1 auth) is present', () => {
      const pkg: PackageJsonData = {
        dependencies: { 'ms-rest-azure': '^3.0.0' },
      };
      const result = checkNoDeprecatedAzureSDK(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should PASS when package.json has no dependencies', () => {
      const pkg: PackageJsonData = {};
      const result = checkNoDeprecatedAzureSDK(pkg);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(7);
    });
  });

  // ─── 1c. checkUsesModernAzureSDK (weight: 5, severity: medium) ──────────

  describe('checkUsesModernAzureSDK', () => {
    it('should PASS when all Azure packages use @azure/ scoped names', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          '@azure/storage-blob': '^12.0.0',
          '@azure/identity': '^4.0.0',
        },
      };
      const result = checkUsesModernAzureSDK(pkg);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('azure-sdk');
      expect(result.signal).toBe('uses-modern-azure-sdk');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(6);
      expect(result.earned).toBe(6);
    });

    it('should FAIL when unscoped azure-* packages exist', () => {
      const pkg: PackageJsonData = {
        dependencies: {
          'azure-storage': '^2.0.0',
          '@azure/identity': '^4.0.0',
        },
      };
      const result = checkUsesModernAzureSDK(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.detail).toMatch(/azure-storage|unscoped|old/i);
    });

    it('should PASS when no Azure packages exist at all', () => {
      const pkg: PackageJsonData = {
        dependencies: { express: '^4.0.0' },
      };
      const result = checkUsesModernAzureSDK(pkg);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(6);
    });
  });

  // ─── 1d. checkAzureTypesPresent (weight: 5, severity: low) ───────────────

  describe('checkAzureTypesPresent', () => {
    it('should PASS when @azure/ packages appear in devDependencies (TypeScript usage implied)', () => {
      const pkg: PackageJsonData = {
        dependencies: { '@azure/storage-blob': '^12.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      };
      const result = checkAzureTypesPresent(pkg);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('azure-sdk');
      expect(result.signal).toBe('azure-types-present');
      expect(result.severity).toBe('low');
      expect(result.weight).toBe(4);
      expect(result.earned).toBe(4);
    });

    it('should FAIL when Azure deps exist but no TypeScript present', () => {
      const pkg: PackageJsonData = {
        dependencies: { '@azure/storage-blob': '^12.0.0' },
      };
      const result = checkAzureTypesPresent(pkg);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should PASS (N/A) when no Azure deps exist', () => {
      const pkg: PackageJsonData = {
        dependencies: { express: '^4.0.0' },
      };
      const result = checkAzureTypesPresent(pkg);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(4);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. IAC DIMENSION (weight budget: 25)
// ═══════════════════════════════════════════════════════════════════════════════

describe('iac dimension', () => {

  // ─── 2a. checkIaCPresent (weight: 8, severity: medium) ────────────────────

  describe('checkIaCPresent', () => {
    it('should PASS when .bicep files exist in root', () => {
      const data = makeRepoFileData({
        rootEntries: [
          { name: 'main.bicep', type: 'file', path: 'main.bicep' },
        ],
      });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('iac');
      expect(result.signal).toBe('iac-present');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(8);
      expect(result.earned).toBe(8);
    });

    it('should PASS when .tf files exist in root', () => {
      const data = makeRepoFileData({
        rootEntries: [
          { name: 'main.tf', type: 'file', path: 'main.tf' },
        ],
      });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });

    it('should PASS when azuredeploy.json exists', () => {
      const data = makeRepoFileData({
        rootEntries: [
          { name: 'azuredeploy.json', type: 'file', path: 'azuredeploy.json' },
        ],
      });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });

    it('should PASS when infra/ directory exists', () => {
      const data = makeRepoFileData({
        rootEntries: [
          { name: 'infra', type: 'dir', path: 'infra' },
        ],
      });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });

    it('should FAIL when no IaC files or directories exist', () => {
      const data = makeRepoFileData({
        rootEntries: [
          { name: 'package.json', type: 'file', path: 'package.json' },
          { name: 'README.md', type: 'file', path: 'README.md' },
        ],
      });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should handle empty root entries', () => {
      const data = makeRepoFileData({ rootEntries: [] });
      const result = checkIaCPresent(data);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  // ─── 2b. checkIaCNoHardcodedSecrets (weight: 10, severity: critical) ─────

  describe('checkIaCNoHardcodedSecrets', () => {
    it('should PASS when IaC files contain no hardcoded secrets', () => {
      const iacFiles = [
        {
          path: 'main.bicep',
          content: `param storageAccountName string\nresource sa 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n  name: storageAccountName\n}`,
        },
      ];
      const result = checkIaCNoHardcodedSecrets(iacFiles);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('iac');
      expect(result.signal).toBe('iac-no-hardcoded-secrets');
      expect(result.severity).toBe('critical');
      expect(result.weight).toBe(10);
      expect(result.earned).toBe(10);
    });

    it('should FAIL when IaC contains password literals', () => {
      // Matches regex: password\s*[:=]\s*['"][8+ chars]['"]
      const iacFiles = [
        {
          path: 'main.bicep',
          content: `password = 'SuperSecret123!'`,
        },
      ];
      const result = checkIaCNoHardcodedSecrets(iacFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.severity).toBe('critical');
      expect(result.recommendation).toBeTruthy();
    });

    it('should FAIL when IaC contains key/secret string literals', () => {
      // Matches regex: secret\s*[:=]\s*['"][8+ chars]['"]
      const iacFiles = [
        {
          path: 'main.tf',
          content: `secret = "abc123secretkey1234"`,
        },
      ];
      const result = checkIaCNoHardcodedSecrets(iacFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should PASS (N/A) when no IaC files exist', () => {
      const result = checkIaCNoHardcodedSecrets([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(10);
    });
  });

  // ─── 2c. checkIaCParameterized (weight: 7, severity: medium) ─────────────

  describe('checkIaCParameterized', () => {
    it('should PASS when Bicep files have param declarations', () => {
      const iacFiles = [
        {
          path: 'main.bicep',
          content: `param location string = 'eastus'\nparam name string`,
        },
      ];
      const result = checkIaCParameterized(iacFiles);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('iac');
      expect(result.signal).toBe('iac-parameterized');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(7);
      expect(result.earned).toBe(7);
    });

    it('should PASS when Terraform files have variable blocks', () => {
      const iacFiles = [
        {
          path: 'variables.tf',
          content: `variable "location" {\n  type = string\n  default = "eastus"\n}`,
        },
      ];
      const result = checkIaCParameterized(iacFiles);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(7);
    });

    it('should FAIL when IaC files exist but have no parameters', () => {
      const iacFiles = [
        {
          path: 'main.bicep',
          content: `resource sa 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n  name: 'hardcoded-name'\n  location: 'eastus'\n}`,
        },
      ];
      const result = checkIaCParameterized(iacFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should PASS (N/A) when no IaC files exist', () => {
      const result = checkIaCParameterized([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(7);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CONFIG DIMENSION (weight budget: 15)
// ═══════════════════════════════════════════════════════════════════════════════

describe('config dimension', () => {

  // ─── 3a. checkAzdYamlPresent (weight: 5, severity: low) ──────────────────

  describe('checkAzdYamlPresent', () => {
    it('should PASS when azure.yaml exists', () => {
      const data = makeRepoFileData({ hasAzureYaml: true });
      const result = checkAzdYamlPresent(data);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('config');
      expect(result.signal).toBe('azd-yaml-present');
      expect(result.severity).toBe('low');
      expect(result.weight).toBe(4);
      expect(result.earned).toBe(4);
    });

    it('should FAIL when azure.yaml is missing', () => {
      const data = makeRepoFileData({ hasAzureYaml: false });
      const result = checkAzdYamlPresent(data);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  // ─── 3b. checkEnvExamplePresent (weight: 5, severity: medium) ────────────

  describe('checkEnvExamplePresent', () => {
    it('should PASS when .env.example exists', () => {
      const data = makeRepoFileData({ hasEnvExample: true });
      const result = checkEnvExamplePresent(data);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('config');
      expect(result.signal).toBe('env-example-present');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(6);
      expect(result.earned).toBe(6);
    });

    it('should FAIL when .env.example is missing', () => {
      const data = makeRepoFileData({ hasEnvExample: false });
      const result = checkEnvExamplePresent(data);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });

  // ─── 3c. checkSecurityPolicyPresent (weight: 5, severity: low) ───────────

  describe('checkSecurityPolicyPresent', () => {
    it('should PASS when SECURITY.md exists', () => {
      const data = makeRepoFileData({ hasSecurityPolicy: true });
      const result = checkSecurityPolicyPresent(data);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('config');
      expect(result.signal).toBe('security-policy-present');
      expect(result.severity).toBe('low');
      expect(result.weight).toBe(5);
      expect(result.earned).toBe(5);
    });

    it('should FAIL when SECURITY.md is missing', () => {
      const data = makeRepoFileData({ hasSecurityPolicy: false });
      const result = checkSecurityPolicyPresent(data);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CI/CD DIMENSION (weight budget: 20)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ci-cd dimension', () => {

  // ─── 4a. checkWorkflowFederatedAuth (weight: 8, severity: high) ──────────

  describe('checkWorkflowFederatedAuth', () => {
    it('should PASS when workflow uses azure/login@ with client-id', () => {
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: [
            'steps:',
            '  - uses: azure/login@v2',
            '    with:',
            '      client-id: ${{ secrets.AZURE_CLIENT_ID }}',
            '      tenant-id: ${{ secrets.AZURE_TENANT_ID }}',
          ].join('\n'),
        },
      ];
      const result = checkWorkflowFederatedAuth(workflows);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('ci-cd');
      expect(result.signal).toBe('workflow-federated-auth');
      expect(result.severity).toBe('high');
      expect(result.weight).toBe(8);
      expect(result.earned).toBe(8);
    });

    it('should FAIL when workflow uses azure/login@ with creds (not federated)', () => {
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: [
            'steps:',
            '  - uses: azure/login@v2',
            '    with:',
            '      creds: ${{ secrets.AZURE_CREDENTIALS }}',
          ].join('\n'),
        },
      ];
      const result = checkWorkflowFederatedAuth(workflows);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.recommendation).toBeTruthy();
    });

    it('should PASS (N/A) when no workflows exist', () => {
      const result = checkWorkflowFederatedAuth([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });

    it('should PASS (N/A) when workflows exist but none use azure/login', () => {
      const workflows = [
        {
          path: '.github/workflows/ci.yml',
          content: 'steps:\n  - uses: actions/checkout@v4\n  - run: npm test',
        },
      ];
      const result = checkWorkflowFederatedAuth(workflows);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(8);
    });
  });

  // ─── 4b. checkWorkflowNoHardcodedCreds (weight: 7, severity: critical) ───

  describe('checkWorkflowNoHardcodedCreds', () => {
    it('should PASS when workflows have no AZURE_CREDENTIALS with inline JSON', () => {
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: [
            'steps:',
            '  - uses: azure/login@v2',
            '    with:',
            '      client-id: ${{ secrets.AZURE_CLIENT_ID }}',
          ].join('\n'),
        },
      ];
      const result = checkWorkflowNoHardcodedCreds(workflows);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('ci-cd');
      expect(result.signal).toBe('workflow-no-hardcoded-creds');
      expect(result.severity).toBe('critical');
      expect(result.weight).toBe(7);
      expect(result.earned).toBe(7);
    });

    it('should FAIL when workflow contains inline AZURE_CREDENTIALS JSON', () => {
      // The rule checks for AZURE_CREDENTIALS with inline {clientId} JSON
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: [
            'env:',
            '  AZURE_CREDENTIALS: \'{"clientId":"abc","clientSecret":"def","subscriptionId":"123","tenantId":"456"}\'',
            'steps:',
            '  - uses: azure/login@v1',
          ].join('\n'),
        },
      ];
      const result = checkWorkflowNoHardcodedCreds(workflows);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.severity).toBe('critical');
    });

    it('should PASS (N/A) when no workflows exist', () => {
      const result = checkWorkflowNoHardcodedCreds([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(7);
    });
  });

  // ─── 4c. checkWorkflowCurrentActions (weight: 5, severity: medium) ───────

  describe('checkWorkflowCurrentActions', () => {
    it('should PASS when azure/login@v2 (current) is used', () => {
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: 'steps:\n  - uses: azure/login@v2',
        },
      ];
      const result = checkWorkflowCurrentActions(workflows);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('ci-cd');
      expect(result.signal).toBe('workflow-current-actions');
      expect(result.severity).toBe('medium');
      expect(result.weight).toBe(5);
      expect(result.earned).toBe(5);
    });

    it('should FAIL when azure/login@v1 (deprecated) is used', () => {
      const workflows = [
        {
          path: '.github/workflows/deploy.yml',
          content: 'steps:\n  - uses: azure/login@v1',
        },
      ];
      const result = checkWorkflowCurrentActions(workflows);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.detail).toMatch(/deprecated|v1|outdated/i);
    });

    it('should PASS (N/A) when no workflows exist', () => {
      const result = checkWorkflowCurrentActions([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
    });

    it('should PASS when no azure/ actions are used', () => {
      const workflows = [
        {
          path: '.github/workflows/ci.yml',
          content: 'steps:\n  - uses: actions/checkout@v4\n  - run: npm test',
        },
      ];
      const result = checkWorkflowCurrentActions(workflows);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SECURITY DIMENSION (weight budget: 15)
// ═══════════════════════════════════════════════════════════════════════════════

describe('security dimension', () => {

  // ─── 5a. checkNoConnectionStringsInSource (weight: 10, severity: critical) ─

  describe('checkNoConnectionStringsInSource', () => {
    it('should PASS when source files contain no connection strings', () => {
      const sourceFiles = [
        {
          path: 'src/app.ts',
          content: `import { DefaultAzureCredential } from '@azure/identity';\nconst client = new BlobServiceClient(url, new DefaultAzureCredential());`,
        },
      ];
      const result = checkNoConnectionStringsInSource(sourceFiles);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('security');
      expect(result.signal).toBe('no-connection-strings-in-source');
      expect(result.severity).toBe('critical');
      expect(result.weight).toBe(10);
      expect(result.earned).toBe(10);
    });

    it('should FAIL when DefaultEndpointsProtocol= is found in source', () => {
      const sourceFiles = [
        {
          path: 'src/storage.ts',
          content: `const connStr = "DefaultEndpointsProtocol=https;AccountName=myacct;AccountKey=abc123";`,
        },
      ];
      const result = checkNoConnectionStringsInSource(sourceFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
      expect(result.severity).toBe('critical');
      expect(result.recommendation).toBeTruthy();
    });

    it('should FAIL when AccountKey= is found in source', () => {
      const sourceFiles = [
        {
          path: 'src/config.js',
          content: `const key = "AccountKey=mySecretKey12345";`,
        },
      ];
      const result = checkNoConnectionStringsInSource(sourceFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should FAIL when Endpoint=sb:// (Service Bus) is found in source', () => {
      const sourceFiles = [
        {
          path: 'src/messaging.py',
          content: `conn_str = "Endpoint=sb://mynamespace.servicebus.windows.net/;SharedAccessKeyName=manage;SharedAccessKey=abc123"`,
        },
      ];
      const result = checkNoConnectionStringsInSource(sourceFiles);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should PASS (N/A) when no source files exist', () => {
      const result = checkNoConnectionStringsInSource([]);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(10);
    });
  });

  // ─── 5b. checkManagedIdentityDocumented (weight: 5, severity: low) ───────

  describe('checkManagedIdentityDocumented', () => {
    it('should PASS when README mentions "managed identity"', () => {
      const readme = '# My App\n\nThis app uses managed identity for authentication.';
      const result = checkManagedIdentityDocumented(readme);

      expect(result.passed).toBe(true);
      expect(result.dimension).toBe('security');
      expect(result.signal).toBe('managed-identity-documented');
      expect(result.severity).toBe('low');
      expect(result.weight).toBe(5);
      expect(result.earned).toBe(5);
    });

    it('should PASS when README mentions "DefaultAzureCredential"', () => {
      const readme = '# Auth\nUse DefaultAzureCredential to authenticate.';
      const result = checkManagedIdentityDocumented(readme);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
    });

    it('should FAIL when README does not mention managed identity or DefaultAzureCredential', () => {
      const readme = '# My App\n\nThis is a sample application.';
      const result = checkManagedIdentityDocumented(readme);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should FAIL when README is null', () => {
      const result = checkManagedIdentityDocumented(null);

      expect(result.passed).toBe(false);
      expect(result.earned).toBe(0);
    });

    it('should be case-insensitive', () => {
      const readme = '# Auth\nUse MANAGED IDENTITY for Azure services.';
      const result = checkManagedIdentityDocumented(readme);

      expect(result.passed).toBe(true);
      expect(result.earned).toBe(5);
    });
  });
});
