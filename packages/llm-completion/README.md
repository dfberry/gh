# llm-completion

This package provides a small, focused wrapper around an OpenAI-compatible completion API used by the `gh-cleanup` tools to generate repository descriptions, suggested topics, and related links.

## Purpose

- Centralize model/endpoint configuration, retries, and response normalization.
- Sanitize model outputs (strip fences, extract JSON payloads, surface parse errors).

## API

- `callOpenAI(prompt: string, cfg?: LLMConfig, opts?: { name?: string }): Promise<LLMResult>` — main entry used by the CLI. Returns raw and cleaned outputs and parsed JSON when available.

## Configuration

- `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY` — preferred environment variables.
- `OPENAI_ENDPOINT` — optional base URL for Azure or custom endpoints.
- `OPENAI_MODEL`, `OPENAI_TEMPERATURE` — optional defaults.

## Debugging

The client supports debug mode that writes the prompt and provider response to disk when enabled: `LLMConfig.debug = { enabled: true, dir: './debug/llm' }`.

## Testing

- Build: `npm run build --workspace=@workspace/llm-completion`
- Tests should mock `globalThis.fetch` (use `vi.stubGlobal('fetch', ...)` with Vitest).

## Usage (example)

```ts
import { callOpenAI } from '@workspace/llm-completion'

const cfg = { debug: { enabled: true, dir: './debug/llm' } };
const resultText = await callOpenAI(prompt, cfg, { name: `${owner}_${repo}` });
```

Keep prompt construction in `gh-cleanup`; this package focuses on calling and normalizing provider responses.

### What it exports
- `callOpenAI(prompt: string, cfg?: LLMConfig, opts?: { name?: string }): Promise<string>` — main entry used by the CLI. The function returns the model's text output; callers in `gh-cleanup` parse and validate JSON from that output.

### Key types (informal)
- `LLMConfig`:
  - `key?: string` — API key override.
  - `model?: string` — model/deployment id.
  - `endpoint?: string` — base URL for OpenAI-compatible endpoints.
  - `temperature?: number` — sampling temperature.
  - `debug?: { enabled?: boolean; dir?: string }` — optional debug recording settings.
- `callOpenAI` `opts` parameter:
  - `name?: string` — optional short name used as the debug filename base (e.g., `owner_repo`). If omitted the client writes timestamped files with a `llm_` prefix.

### How `gh-cleanup` uses this package
- `gh-cleanup` builds a prompt (repository metadata, README excerpts, examples) and calls
  `callOpenAI(prompt, cfg, { name })`.
- The helper normalizes the response (removes ```json fences, extracts the first JSON
  object if present) and returns structured fields for downstream validation and
  application to GitHub repositories.

### Environment & configuration
- `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` — preferred environment variables. The
  CLI also accepts `--openai-key` for ad-hoc runs.
 # llm-completion

 Lightweight OpenAI/OpenAI-compatible completion helpers used by `gh-cleanup` to
 generate repository descriptions, suggested topics, and related links.

 ## Purpose

 - Centralize model/endpoint configuration, retries, and response normalization.
 - Sanitize model outputs (strip fences, extract JSON payloads, surface parse errors).
 - Keep prompt construction in `gh-cleanup`; this package focuses on calling and
   normalizing provider responses.

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

- This package returns both `raw` and `clean` outputs so callers can surface raw content
  in error diagnostics when parsing fails.
- Keep prompt construction in `gh-cleanup` to maintain an auditable describe flow.

## Maintainer

See `packages/gh-cleanup/README.md` for examples of how the module is used in the
repo-level pipeline and how to configure keys/secrets for CI runs.
