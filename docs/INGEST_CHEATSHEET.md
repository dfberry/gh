Cheatsheet — produce evaluate input from a gather run

Goal
- Turn gather outputs into a JSON `--input` file (array of "owner/name") that `evaluate` can consume.

Preferred flow (per-repo folders)
- Run gather (example):
  - `npm run gather` or `npm --prefix packages/gh-cleanup run start -- gather`
- Generate the evaluate input by scanning the gather output dir for per-repo folders:
  - `npm run ingest:generate-evaluate-input`
  - Or explicitly:
    - `node scripts/generate-evaluate-input.js --gather=./generated/gh-cleanup-gather --out=./generated/gh-cleanup-evaluate/evaluate-input.json`
- Run evaluate using that input:
  - `node --env-file "./.env" packages/gh-cleanup/dist/bin/cli.js evaluate --input="./generated/gh-cleanup-evaluate/evaluate-input.json" --out="./generated/gh-cleanup-evaluate" --out-prefix="evaluate"`

What the script expects/produces
- Looks for per-repo folders under the gather out directory named like `owner_repo`.
- Writes an array of `["owner/name", ...]` to the `--out` path you pass.

Legacy (flat tmp files)
- If your gather output is legacy flat `tmp-*.json` files in one folder, run migration first:
  - `npm run ingest:migrate-flat`
  - Or explicitly:
    - `node scripts/migrate-flat-to-per-repo.js --dir=./path/to/flat-files`
- After migration you will have per-repo folders and can run `ingest:generate-evaluate-input`.

Copy option
- To copy per-repo gather folders into an evaluate directory (if desired):
  - `npm run ingest:copy-gather`
  - Or:
    - `node scripts/copy-gather-to-evaluate.js --from=./generated/gh-cleanup-gather --to=./generated/gh-cleanup-evaluate`

Expected layout after gather
- `<out>/<owner_repo>/<outPrefix>-<step>.json` — step output for that repo
- `<out>/<owner_repo>/<outPrefix>-<step>-input.json` — per-step normalized input for the repo
- `<out>/<outPrefix>-summary.json` — group summary (top-level)

Troubleshooting
- If `generate-evaluate-input` reports 0 repos:
  - Confirm the `--gather` path exists and contains per-repo subdirectories or flat `tmp-*.json` files.
  - If flat files, run `ingest:migrate-flat` first.
- You can run the scripts directly with `node` or via the npm aliases in `package.json`.

Quick examples
- Generate evaluate input from a gather output dir:
  - `node scripts/generate-evaluate-input.js --gather=./generated/gh-cleanup-gather --out=./generated/gh-cleanup-evaluate/evaluate-input.json`
- Migrate a legacy flat folder into per-repo folders:
  - `node scripts/migrate-flat-to-per-repo.js --dir=./packages/gh-cleanup/generated-test`

Notes
- Prefer per-repo folders — they are deterministic and simplify discovery.
- The scripts in `scripts/` are lightweight helpers for local workflows and CI adjustments.
