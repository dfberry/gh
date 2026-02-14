## Reusable npm Script

Add this to `package.json`:

```json
{
  "scripts": {
    "verify:copilot": "bash ./scripts/copilot-agent-verify.sh YOUR_ORG/YOUR_REPO",
    "fix:copilot": "bash ./scripts/copilot-agent-verify.sh YOUR_ORG/YOUR_REPO apply"
  }
}
```

This allows:

```bash
npm run verify:copilot
npm run fix:copilot
```
