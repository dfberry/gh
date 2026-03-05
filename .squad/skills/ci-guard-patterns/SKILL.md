# Skill: CI Guard Patterns

## When to Apply
When adding CI workflows that gate files from reaching protected branches (main, preview, insider).

## Core Pattern: Allowlist over Blocklist

**Wrong:** Block entire directories indiscriminately.
```js
// BAD — blocks everything, including files that need to flow
if (f.startsWith('.squad/')) return true;
```

**Right:** Block only the noisy subdirectories. Let knowledge files through.
```js
// GOOD — surgical blocklist, knowledge flows through
if (f.startsWith('.squad/')) {
  const blockedPrefixes = [
    '.squad/orchestration-log/',
    '.squad/log/',
    '.squad/decisions/inbox/',
    '.squad/sessions/',
  ];
  return blockedPrefixes.some(prefix => f.startsWith(prefix));
}
```

## Two-Layer Defense

For files that should never reach any branch:
1. **`.gitignore`** — prevents accidental commits (first line of defense)
2. **Guard workflow** — catches anything that slips through `.gitignore` (second line)

Both layers should agree on what's blocked. If a directory is in the guard blocklist, it should also be in `.gitignore`.

## Guard Workflow Structure

- Use `actions/github-script@v7` for file-checking logic
- Handle both `pull_request` (listFiles API) and `push` (compareCommits) events
- Always allow `status: 'removed'` — deleting forbidden files is fine
- Provide clear, actionable error messages with copy-paste fix commands

## When Adding New Runtime Directories

If a new noisy/runtime directory is added under `.squad/`:
1. Add to guard workflow `blockedPrefixes` array
2. Add to `.gitignore`
3. Update the decision doc
