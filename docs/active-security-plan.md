# Active Security Plan

TL;DR: Two-stage rollout —

- Stage 1 (GA-only): collect each repository's current security configuration using stable, non-preview GitHub endpoints and report per-repo booleans/presence checks (Dependabot config, vulnerability alerts, automated security fixes, secret scanning, code scanning, dependency graph, security policy).
- Stage 2 (Previews & Evaluate): opt-in preview Accept headers and add alert-listing helpers so the `evaluate` command group can surface actionable remediation items (Dependabot alerts, code-scanning alerts, secret-scanning alerts).

Purpose

This document outlines a conservative, staged plan to add repository security discovery to the `active` command group (what features are turned on) and to add evaluation commands in the `evaluate` group (what security findings exist and need remediation).

Stage 1 — Active (Are features turned on?)

Important: Stage 1 only collects configuration/presence checks and returns boolean/presence fields. It WILL NOT perform evaluations or list alerts (those belong to Stage 2 `evaluate` commands).

Goal: For each repository, produce an `ActiveSecurityConfig` summary with boolean/presence fields indicating whether core security features are configured.

Primary GA checks

- `vulnerability_alerts` — check `GET /repos/{owner}/{repo}/vulnerability-alerts`: 204 => enabled, 404 => disabled.
- `automated_security_fixes` — check `GET /repos/{owner}/{repo}/automated-security-fixes` or repo `security_and_analysis` fields.
- `dependabot_config_present` — check for `.github/dependabot.yml` (Contents API: `GET /repos/{owner}/{repo}/contents/.github/dependabot.yml` and `.yaml`).
- `secret_scanning` — read `security_and_analysis` from `GET /repos/{owner}/{repo}` or fall back to secret-scanning endpoints.
- `code_scanning` — prefer `security_and_analysis` advanced security flags or a lightweight `code-scanning` endpoint probe.
- `dependency_graph` — read from `security_and_analysis` or repo fields.
- `security_policy_file` — presence of `SECURITY.md` via the Contents API.

Stage 1 Implementation (github-rest)

Breakdown: implement GA-only helpers and tests in small, verifiable steps.

1. Create file and types — **Completed**
   - Add `packages/github-rest/src/endpoints/security.ts` exporting typed helper signatures and an `ActiveSecurityConfig` type. (file created)
   - Include `SecurityCallOptions = { accept?: string | string[]; signal?: AbortSignal }` but do NOT enable preview headers by default.

2. Implement individual probes (one helper per concern)
   - `isVulnerabilityAlertsEnabled(client, owner, repo, options?)` — call `GET /repos/{owner}/{repo}/vulnerability-alerts`, normalize 204 => `true`, 404 => `false`. **Completed**
   - `isAutomatedSecurityFixesEnabled(client, owner, repo, options?)` — probe `/automated-security-fixes` or fall back to `security_and_analysis` when available. **Completed**
   - `hasDependabotConfig(client, owner, repo, options?)` — call Contents API for `.github/dependabot.yml` and `.yaml` variants and normalize presence. **Completed**
   - `isSecretScanningEnabled(client, owner, repo, options?)` — prefer `security_and_analysis` flags; otherwise probe secret-scanning endpoints. **Completed**
   - `isCodeScanningEnabled(client, owner, repo, options?)` — prefer `security_and_analysis` flags; otherwise perform a lightweight probe. **Completed**
   - `isDependencyGraphEnabled(client, owner, repo, options?)` — read from `security_and_analysis` or repo metadata. **Completed**

3. Implement aggregator
   - `getRepoSecurityConfig(client, owner, repo, options?)` should call the probes in parallel (where safe), assemble an `ActiveSecurityConfig`, and include `permission_issue` when visibility is limited. **Completed**

4. Reuse `GitHubClient` utilities
   - Use `client.rawRequest()`/`client.get()` and the existing header-building behavior.
   - For 204/404 endpoints, convert status codes to booleans and throw `GitHubError` on unexpected codes.

5. Tests (mocked) — **Completed (Stage 1 helpers & aggregator)**
   - `packages/github-rest/src/endpoints/security.test.ts` added covering the Stage 1 probes and `getRepoSecurityConfig` aggregator.
   - Tests mock external dependencies (use `vi` and stub `GitHubClient.rawRequest` / `client.get`) and assert header handling and boolean normalization. `vitest` was added to `packages/github-rest` and the Stage 1 tests pass.

6. Export and integrate
   - Add `export * as security from './endpoints/security.js'` to `packages/github-rest/src/index.ts`.
   - Keep Stage 1 strictly GA-only (do not merge preview Accept headers unless `options.accept` is explicitly set by the caller).

Stage 1 Implementation (gh-cleanup active group)

1. Add `packages/gh-cleanup/src/commands/active-security.ts` implementing `collectActiveSecurityConfig(argv)`:
   - create a client via `createGitHubClient()` (factory in `github-rest`),
   - call `security.getRepoSecurityConfig()` per repo,
   - normalize results into a compact `ActiveSecurityConfig` object,
   - write output using existing report helpers in `packages/gh-cleanup/src/lib/report.ts`.

2. Register the command in `packages/gh-cleanup/src/commandgroups/active.ts` and in the CLI registry `packages/gh-cleanup/src/bin/commands.ts` following existing patterns.

3. Add permission-awareness: use `GitHubClient.ensureScopes()` and `hasRepoAdmin()` to detect when `security_and_analysis` fields are not visible; when visibility is limited, include a `permission_issue` string in the `ActiveSecurityConfig`.

Stage 2 — Previews & Evaluate (What is reporting?)

Goal: Add optional preview usage and alert-listing helpers so `evaluate` commands can surface actionable items for remediation (Dependabot alerts, code-scanning alerts, secret-scanning alerts).

Stage 2 Implementation

1. Add `packages/github-rest/src/endpoints/_previews.ts` containing friendly preview token constants (placeholders to be verified against GitHub docs before use).

2. Extend `security.ts` helpers to merge `options.accept` into request headers when explicitly provided. Do not enable previews by default.

3. Add paginated listing helpers for alerts:
   - `listDependabotAlerts(client, owner, repo, options?)`
   - `listCodeScanningAlerts(client, owner, repo, options?)`
   - `listSecretScanningAlerts(client, owner, repo, options?)`

   Reuse `packages/github-rest/src/pagination` utilities for paging.

4. Add `packages/gh-cleanup/src/commands/evaluate-security.ts` implementing `evaluateSecurityCommand(argv)` that:
   - optionally uses preview-enabled helpers to list alerts,
   - aggregates actionable remediation items per repo,
   - writes concise, linkable output for follow-up.

5. Register `evaluate-security` in `packages/gh-cleanup/src/commandgroups/evaluate.ts`.

Tests & Documentation

- Add tests: `packages/github-rest/src/endpoints/security.test.ts`, `packages/gh-cleanup/src/commands/active-security.test.ts`, and `packages/gh-cleanup/src/commands/evaluate-security.test.ts` following existing test conventions.
- Update docs: `packages/gh-cleanup/README.md`, `docs/GET-GITHUB-TOKEN.md`, and include this file in the repo root docs folder.

- Testing requirement: All unit tests MUST mock external dependencies (network requests, `GitHubClient.rawRequest`, organization/permission checks, etc.). Prefer `vi` for mocks and stub `globalThis.fetch` or `GitHubClient.rawRequest` as appropriate so tests don't make real network calls.

Permissions & Visibility Notes

- `GET /repos/{owner}/{repo}`: `security_and_analysis` fields are visible only to repo admins, organization owners, or security managers. Implement checks via `hasRepoAdmin()` and surface `permission_issue` when reads are incomplete.
- For private repos, required scopes typically include `repo`. Some security operations may require admin scopes; document exact scope requirements and verify before Stage 2.

Accept / Preview Guidance

- Default: Stage 1 must not send preview Accept headers.
- Stage 2: provide `options.accept` and a `_previews.ts` map; only merge preview headers into requests when `options.accept` is set by caller.

Data Model Suggestion

Define `ActiveSecurityConfig` with fields such as:
- `vulnerability_alerts: boolean`
- `automated_security_fixes: boolean`
- `dependabot_config_present: boolean`
- `secret_scanning: boolean`
- `code_scanning: boolean`
- `dependency_graph: boolean`
- `security_policy_file: boolean`
- `permission_issue?: string`

Rollout Checklist

- [ ] Implement Stage 1 `security.ts` helpers
- [ ] Add `active-security` command and register it
- [ ] Add unit tests for Stage 1
- [ ] Verify no preview headers are sent by default
- [ ] Add `_previews.ts` and Stage 2 optional previews
- [ ] Implement `evaluate-security` and tests

Open questions

- Confirm exact preview Accept headers for any preview-only endpoints before Stage 2 implementation.
- Confirm preferred `ActiveSecurityConfig` output field names and whether the structure should be versioned.

Notes

- This staged approach separates discovery (Stage 1) from evaluation/action (Stage 2), letting teams adopt GA-only checks quickly and opt into previews and alert listing later.
