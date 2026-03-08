/**
 * .env.example template for sample repositories.
 */

export const ENV_EXAMPLE_TEMPLATE = `# Environment Variables Template
# Copy this file to .env and fill in your actual values
# NEVER commit the .env file to version control!

# ─── GitHub Configuration ────────────────────────────────────────────────────
# Personal access token with appropriate scopes for your use case
# Create at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here

# Optional: If using GitHub App authentication
# GITHUB_APP_ID=
# GITHUB_PRIVATE_KEY=
# GITHUB_INSTALLATION_ID=

# ─── Azure Configuration (if applicable) ─────────────────────────────────────
# AZURE_SUBSCRIPTION_ID=
# AZURE_TENANT_ID=
# AZURE_CLIENT_ID=
# AZURE_CLIENT_SECRET=

# ─── Application Settings ────────────────────────────────────────────────────
# NODE_ENV=development
# LOG_LEVEL=info
# PORT=3000

# ─── Database (if applicable) ────────────────────────────────────────────────
# DATABASE_URL=
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=
# DB_USER=
# DB_PASSWORD=

# ─── Other Service Credentials ───────────────────────────────────────────────
# API_KEY=
# SERVICE_URL=
`;
