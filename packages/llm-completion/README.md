# llm-completion

This package provides a small, focused wrapper around an OpenAI-compatible completion API used
by the `gh-cleanup` tools to generate human-friendly repository descriptions, short/long
descriptions, recommended topics, and related links.

Purpose
- Offer a single place to configure model/endpoint/timeout behavior and to normalize LLM
  responses (strip fences, extract JSON payloads, and surface parse errors).
- Keep the higher-level CLI and prompt construction in `gh-cleanup` while centralizing
  the HTTP/calling logic and response sanitization here.

What it exports
- `callOpenAI(opts: CallOpenAIOptions): Promise<LLMResult>` — main entry used by the CLI.

Key types (informal)
- `CallOpenAIOptions`:
  - `prompt: string` — the full prompt to send to the model.
  - `model?: string` — optional model override.
  - `endpoint?: string` — optional base URL for an OpenAI-compatible endpoint.
  - `temperature?: number` — sampling temperature.
  - `maxTokens?: number` — token budget.
- `LLMResult`:
  - `raw: string` — original model output.
  - `clean: string` — output after removing code fences and trimming.
  - `json?: any` — parsed JSON if the output contained JSON.
  - `usage?: object` — provider usage metadata when available.

How `gh-cleanup` uses this package
- `gh-cleanup` builds a prompt (repository metadata, README excerpts, examples) and calls
  `callOpenAI({ prompt, model, endpoint, temperature })`.
- The helper normalizes the response (removes ```json fences, extracts the first JSON
  object if present) and returns structured fields for downstream validation and
  application to GitHub repositories.

Environment & configuration
- `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` — preferred environment variables. The
  CLI also accepts `--openai-key` for ad-hoc runs.
- `OPENAI_ENDPOINT` — custom base URL for the OpenAI-compatible API (used for Azure or
  private endpoints).
- `OPENAI_MODEL` and `OPENAI_TEMPERATURE` — optional defaults used when callers do not
  pass explicit overrides.

Examples
- Basic usage from code (TypeScript):

```ts
import { callOpenAI } from '@workspace/llm-completion'

const result = await callOpenAI({ prompt: 'Suggest topics for repo X', model: process.env.OPENAI_MODEL })
console.log(result.json ?? result.clean)
```

- As part of the `gh-cleanup` CLI the package is invoked indirectly; typical runner
  (from repository root) to run the describe step is:

```bash
# dry-run descriptions (requires OPENAI_API_KEY in env)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json

# apply suggested changes to repositories (use with caution)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json --apply
```

Testing & development
- Build the package locally:

```bash
npm run build --workspace=@workspace/llm-completion
```

- Unit tests should mock network calls; within the monorepo we favor `vitest` and
  `globalThis.fetch` mocking. Example in tests:

```ts
vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  text: async () => '```json\n{"short":"desc"}\n```',
  json: async () => ({})
})))
```

Notes and guidance
- This package intentionally returns both `raw` and `clean` outputs to make debugging
  LLM parsing issues easier (the calling code can include raw content in error
  annotations or logs).
- Keep prompt construction in `gh-cleanup` so the describe flow remains auditable;
  use this package only for making the HTTP call and sanitizing responses.

Maintainer contact
- See `packages/gh-cleanup/README.md` for examples of how the module is used in the
  repo-level pipeline and how to configure keys/secrets for CI runs.

# llm-completion

Lightweight OpenAI completion helpers used by `gh-cleanup` to generate repository descriptions and topics.

This package exposes a minimal `callOpenAI(prompt)` function. CLI and fetching moved to `gh-cleanup`.

Usage:

```bash
# from repository root
npm run build --workspace=@workspace/llm-completion
```
