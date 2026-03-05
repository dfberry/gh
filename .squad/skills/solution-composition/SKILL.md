---
name: "solution-composition"
description: "Patterns for composing end-to-end solutions from packages in this monorepo"
domain: "solution-development"
confidence: "high"
source: "codebase analysis — all 4 existing solutions studied"
---

## Context

Solutions live in `solutions/{name}/` and are thin orchestration layers that compose `packages/github-rest` and `packages/llm-completion` into complete workflows. They never duplicate package logic.

## Patterns

### Solution File Structure

Every solution has exactly:
- `src/index.ts` — exported pipeline function(s), no side effects
- `src/cli.ts` — CLI entry point with `#!/usr/bin/env node`, handles argv parsing, env vars, error formatting
- `package.json` — `type: "module"`, deps via `file:../../packages/{pkg}` or `file:../packages/{pkg}`
- `tsconfig.json` — extends from root or self-contained

### Package Dependencies

Use `file:` references, never published versions:
```json
{
  "dependencies": {
    "github-rest": "file:../../packages/github-rest",
    "llm-completion": "file:../../packages/llm-completion"
  }
}
```

### Token Handling

```typescript
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
```
Always check both env vars. Warn (don't fail) if missing for read-only operations.

### Output Naming

Files named: `{owner}-{repo}-{context}.{ext}` (e.g., `MicrosoftDocs-azure-dev-docs-pr-8560-comments.json`)

### Pipeline Pattern

All solutions follow: Input (CLI args/JSON file) → GitHub API extraction → optional LLM transformation → Output (JSON/Markdown/GitHub API actions)

### Bot Filtering (for PR comment solutions)

`get-instruction-from-pr-comments/src/index.ts` has a reusable bot detection system:
- Known bot set: acrolinx-bot, dependabot, github-actions[bot], etc.
- Pattern matching: accounts containing `[bot]`, `-bot`, ending with `bot`
- Importance scoring: author frequency × content length × code blocks × links

## Examples

```typescript
// Typical solution index.ts export pattern
export async function doTheThing(options: ThingOptions): Promise<ThingResult> {
  // 1. Validate inputs
  // 2. Call github-rest APIs
  // 3. Optional: call LLM
  // 4. Return structured result
}
```

```typescript
// Typical CLI pattern
async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  if (!arg1) { console.error('Usage: ...'); process.exit(1); }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const result = await doTheThing({ ... });
    await writeFile(outputPath, JSON.stringify(result, null, 2));
  } catch (err) { console.error(err); process.exit(2); }
}
main();
```

## Anti-Patterns

- **Duplicating package logic in solutions** — Always import from packages; if a helper doesn't exist, add it to the package first.
- **Calling fetch directly** — Use `GitHubClient` from `github-rest` for all GitHub API calls.
- **Hardcoding tokens** — Always use env vars (GH_TOKEN / GITHUB_TOKEN).
- **Synchronous fs APIs** — Use `fs/promises` or `fs.promises.*` for all file I/O.
