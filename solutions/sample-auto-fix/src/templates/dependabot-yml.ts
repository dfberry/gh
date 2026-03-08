/**
 * .github/dependabot.yml template for sample repositories.
 */

export const DEPENDABOT_YML_TEMPLATE = `# Dependabot configuration for automated dependency updates
# Documentation: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates

version: 2
updates:
  # Enable version updates for npm (JavaScript/TypeScript)
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "automated"
    commit-message:
      prefix: "chore(deps):"
      prefix-development: "chore(deps-dev):"
    reviewers:
      - "repository-maintainers"
    # Group minor and patch updates to reduce PR noise
    groups:
      development-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "patch"

  # Enable security updates for GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    labels:
      - "dependencies"
      - "github-actions"
    commit-message:
      prefix: "chore(actions):"

  # Uncomment if using Python
  # - package-ecosystem: "pip"
  #   directory: "/"
  #   schedule:
  #     interval: "weekly"

  # Uncomment if using Docker
  # - package-ecosystem: "docker"
  #   directory: "/"
  #   schedule:
  #     interval: "weekly"
`;
