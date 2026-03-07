/**
 * azure.yaml template for sample repositories using Azure.
 */

export const AZURE_YAML_TEMPLATE = `# Azure Developer CLI (azd) configuration
# Documentation: https://learn.microsoft.com/azure/developer/azure-developer-cli/

name: sample-app
metadata:
  template: sample-app

services:
  api:
    project: ./
    language: typescript
    host: appservice
    # Uncomment for container deployment
    # host: containerapp

# Infrastructure as Code configuration
infra:
  provider: bicep
  path: ./infra
  # Uncomment for Terraform
  # provider: terraform

# Hooks for custom scripts (optional)
# hooks:
#   preprovision:
#     run: echo "Pre-provision hook"
#   postprovision:
#     run: echo "Post-provision hook"
#   predeploy:
#     run: npm run build
#   postdeploy:
#     run: echo "Deployment complete"

# Environment variables (non-sensitive values only)
# For secrets, use Azure Key Vault integration
# env:
#   NODE_ENV: production
`;
