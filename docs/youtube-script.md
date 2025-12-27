Title: Clean Up Your GitHub Repos — End-of-Year Project

Runtime: ~3-4 minutes

Intro (0:00-0:20)
- Say: "Hey, I'm [Your Name]. For the end of the year I built a tiny tool to help clean up my GitHub — archive stale projects, delete empty repos, and catalog what I want to keep. In 4 minutes, I'll show you how to run it and what to watch out for."
- Do: Show quick screen of GitHub profile, then repo README.

Install & prerequisites (0:20-0:40)
- Say: "You need Node 22 and a GitHub token in `GH_TOKEN`. Clone the repo and run `npm install` and `npm run build`."
- Do: Show terminal, run `git clone ...`, `npm install`, `npm run build` (speed up/skip with jump cut).

Run examples (0:40-2:10)
- Say: "First, dry-run to see what will happen. This won't change anything." 
- Do: Show running `npm run start -w gh-cleanup -- remove-forks` in terminal. Pause on output.
- Say: "You can archive stale repos — here's the dry-run." 
- Do: Run `npm run start -w gh-cleanup -- archive-stale-repos` and show output.
- Say: "Detect empty repos — these are size 0 and have no commits or PRs. The tool treats 409 responses from the commits API as empty." 
- Do: Run `npm run start -w gh-cleanup -- delete-empty-repos` and emphasize dry-run.
- Say: "If you want a catalog for a static site, use `categorize-repos` with `--fetch` to pull languages and README and write a Markdown table." 
- Do: Run `npm run start -w gh-cleanup -- categorize-repos --fetch --output=md --out=generated/catalog.md`, then open `generated/catalog.md` in an editor.

Safety & deleting (2:10-2:40)
- Say: "Everything defaults to dry-run. To actually delete or archive, pass `--yes` and you'll be prompted to type `YES` unless you use `--force`. Be careful — deletion requires a token with `delete_repo` permission." 
- Do: Show prompt/confirmation text in the terminal (no destructive action).

Wrap-up (2:40-3:00)
- Say: "That's it — quick, safe, and reusable. The code is in `packages/github-rest` (shared helpers) and `packages/gh-cleanup` (commands). Check the docs and generated examples in the repo."
- Do: Show repo README and point to `docs/blog-post.md` and `generated/` folder.

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
