Title: Clean Up Your GitHub Repos — End-of-Year Project

Runtime: ~3-4 minutes

Intro (0:00-0:20)
- Say: "Hey, I'm [Your Name]. For the end of the year I built a tiny tool to help clean up my GitHub — archive stale projects, delete empty repos, and catalog what I want to keep. In 4 minutes, I'll show you how to run it and what to watch out for."
- Do: Show quick screen of GitHub profile, then repo README.

Install & prerequisites (0:20-0:40)
- Say: "You need Node 22 and a GitHub token in `GH_TOKEN`. Clone the repo and run `npm install` and `npm run build`."
- Do: Show terminal, run `git clone ...`, `npm install`, `npm run build` (speed up/skip with jump cut).

Using `./scripts/run-all.sh` and `sample.env`
- This project includes a convenience runner at `./scripts/run-all.sh` that orchestrates
	the main audit-and-cleanup steps and writes results to `generated/`.
- Prepare your environment by copying the provided `sample.env` (or creating a `.env` file)
	and setting required secrets such as `GH_TOKEN` and optionally `OPENAI_API_KEY`.

Example: create a working `.env` from `sample.env` (local, non-secret values may be present)

```bash
# copy and edit sample.env to .env, then add your secrets
cp sample.env .env
# edit .env and set GH_TOKEN and optionally OPENAI_API_KEY
${EDITOR:-vi} .env
```

Run examples (0:40-2:10)
- Say: "First, dry-run the full pipeline to see what will happen. This won't change anything." 
- Do: Show running the runner without `--apply` which performs dry-runs and writes outputs to `generated/`.

```bash
./scripts/run-all.sh
```

- Say: "Review the generated files in `generated/` — `active.json`, `catalog.md`, `summary_*.md` and others contain the dry-run results." 
- Do: Open `generated/summary-report.md` or `generated/active.json` in an editor and show snippets.

- Say: "To actually apply safe, gated changes (archive/delete/patch), pass `--apply` to the runner. Be sure your `.env` contains `GH_TOKEN` with the right scopes; for description updates also set `OPENAI_API_KEY`."
- Do: Show the command and emphasize the risk.

```bash
# WARNING: destructive when --apply is supplied; ensure .env has GH_TOKEN with required scopes
./scripts/run-all.sh --apply
```

- Say: "If you only want to run the describe step (LLM-driven descriptions/topics), ensure `OPENAI_API_KEY` is set in your `.env` and run the describe command or let the runner include it when `OPENAI_API_KEY` is present."
- Do: Show the describe command example:

```bash
# dry-run descriptions (requires OPENAI_API_KEY in .env)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json

# apply suggested description/topics (use with caution)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json --apply --openai-key=$OPENAI_API_KEY
```

Safety & deleting (2:10-2:40)
- Say: "Everything defaults to dry-run. To actually delete or archive, pass `--yes` and you'll be prompted to type `YES` unless you use `--force`. Be careful — deletion requires a token with `delete_repo` permission." 
- Do: Show prompt/confirmation text in the terminal (no destructive action).

Wrap-up (2:40-3:00)
- Say: "That's it — quick, safe, and reusable. Inspect the `generated/` folder to review dry-run outputs, and see the repository `README.md` for more details and advanced options."
- Do: Show repo README and the `generated/` folder in your editor.

Call to action (3:00-3:15)
- Say: "If you try it, back up your data and share any improvements as a PR. If you want I can make a Docker image or walk through adding more checks. Thanks for watching!"
- Do: Show GitHub stars/fork buttons animation and fade out.

Notes for editor
- Keep terminal segments short. Speed up long waits and zoom in on important lines.
- Use on-screen text to show the specific commands being run.
- Use the generated markdown table as a picture to show what ends up on a static site.

End of script

Roadmap / Next features (spoken)

- Say: "If you're building on this, here are some next ideas: a Docker runner, a GitHub Action to run audits, an interactive interface to approve changes before they run, and richer heuristics that detect package manifests and licenses."
- Do: Show a short overlay list of the suggested features while the speaker names them.

Editor note
- Leave a small on-screen caption inviting viewers to open an issue or PR to suggest features or volunteer implementation help.
