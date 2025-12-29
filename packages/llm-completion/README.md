
# llm-completion

Lightweight OpenAI completion helpers used by `gh-cleanup` to generate repository descriptions and topics.

This package exposes a minimal `callOpenAI(prompt)` function. CLI and fetching moved to `gh-cleanup`.

Usage:

```bash
# from repository root
npm run build --workspace=@workspace/llm-completion
```
