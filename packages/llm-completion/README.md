# llm-completion

Lightweight OpenAI/OpenAI-compatible completion helpers used by `gh-cleanup` to generate repository descriptions, suggested topics, and related links.

## Purpose

- Centralize model/endpoint configuration, retries, and response normalization.
- Sanitize model outputs (strip fences, extract JSON payloads, surface parse errors).
- Keep prompt construction in `gh-cleanup`; this package focuses on calling and normalizing provider responses.

## Exports / API

- `callOpenAI(opts: CallOpenAIOptions): Promise<LLMResult>` — main entry used by the CLI.

### Key types (TypeScript)

```ts
export interface CallOpenAIOptions {
  prompt: string;
  model?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  debug?: { enabled?: boolean; dir?: string };
}

export interface LLMResult {
  raw: string;
  clean: string;
  json?: any;
  usage?: Record<string, any>;
}
```

## Configuration

- `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY` — preferred env vars.
- `OPENAI_ENDPOINT` — optional base URL for Azure or custom endpoints.
- `OPENAI_MODEL`, `OPENAI_TEMPERATURE` — optional defaults.

## Debugging

When `debug.enabled` is true and `debug.dir` is set the client writes per-request files:
- `<name>_input.txt` — the prompt sent to the model
- `<name>_output.json` — the full provider response JSON

Debug write failures are logged as warnings and do not cause the core call to fail.

## Usage (example)

```ts
import { callOpenAI } from '@workspace/llm-completion'

const result = await callOpenAI({ prompt: 'Suggest topics for repo X' })
console.log(result.json ?? result.clean)
```

As part of the `gh-cleanup` CLI the package is invoked indirectly; typical runner examples:

```bash
# dry-run descriptions (requires OPENAI_API_KEY in env)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json

# apply suggested changes to repositories (use with caution)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json --apply
```

## Quickstart

Build the package locally and run the describe step (dry-run):

```bash
npm run build --workspace=@workspace/llm-completion
```

## Testing & development

- Build locally: `npm run build --workspace=@workspace/llm-completion`
- Tests should mock `globalThis.fetch` (use `vi.stubGlobal('fetch', ...)` with Vitest).

Example test snippet:
```ts
vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  text: async () => '```json\n{"short":"desc"}\n```',
  json: async () => ({})
})))
```

## Notes

- This package returns both `raw` and `clean` outputs so callers can surface raw content in error diagnostics when parsing fails.
- Keep prompt construction in `gh-cleanup` to maintain an auditable describe flow.

## Maintainer

See `packages/gh-cleanup/README.md` for examples of how the module is used in the repo-level pipeline and how to configure keys/secrets for CI runs.

