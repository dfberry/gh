# pr-comments-to-instructions

A CLI and library to convert PR comments JSON files into instruction files using LLM completion.

## Installation

This package is part of the monorepo workspace. Build from the root:

```bash
npm run build
```

## Usage (CLI)

```bash
get-instruction-from-pr-comments <json-file> <system-prompt-file> <user-prompt-file> [output-file]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `json-file` | Path to the PR comments JSON file (from `get-pr-comments`) |
| `system-prompt-file` | Path to file containing the system prompt |
| `user-prompt-file` | Path to file containing the user prompt |
| `output-file` | (Optional) Path to write the generated instructions |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (or `AZURE_OPENAI_API_KEY`) |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o-mini`) |
| `OPENAI_ENDPOINT` | API endpoint (default: `https://api.openai.com/v1/chat/completions`) |

### Examples

```bash
# Output to stdout
get-instruction-from-pr-comments comments.json system.txt user.txt

# Output to file
get-instruction-from-pr-comments comments.json system.txt user.txt instructions.md
```

## Usage (Library)

```typescript
import { generateInstructions } from 'get-instruction-from-pr-comments';

const result = await generateInstructions({
  jsonFile: 'comments.json',
  systemPrompt: 'You are a helpful assistant...',
  userPrompt: 'Analyze the following PR comments...',
  outputFile: 'instructions.md', // optional
  llmConfig: {
    key: 'your-api-key',
    model: 'gpt-4o',
  },
});

console.log(result);
```

## Workflow

1. Use `get-pr-comments` to fetch PR comments:
   ```bash
   get-pr-comments owner repo 123 > comments.json
   ```

2. Create your prompt files:
   - `system.txt` - System instructions for the LLM
   - `user.txt` - User prompt template

3. Generate instructions:
   ```bash
   pr-comments-to-instructions comments.json system.txt user.txt instructions.md
   ```
