import type { GitHubClient } from 'github-rest';
import { parseRepoInput } from '../lib/input-parser.js';
import { writeNormalizedInput } from '../lib/output.js';
import * as path from 'path';
export type CommandRunner = (argv: string[], client?: GitHubClient) => Promise<void>;

export type ImportFn = (modulePath: string) => Promise<any>;

export function makeRunner(
  modulePath: string,
  exportName: string,
  importFn: ImportFn = (p: string) => import(p),
): CommandRunner {
  return async (argv: string[], client?: GitHubClient) => {
    // dynamic import keeps startup fast; importFn is injectable for tests
    const m = await importFn(modulePath);
    const fn = (m as any)[exportName];
    if (typeof fn !== 'function') {
      throw new Error(`Export ${exportName} not found in ${modulePath}`);
    }

    // Default centralized per-repo behavior for single commands (not command groups)
    // Command groups (under /commandgroups/) already manage per-repo behavior.
    if (modulePath.includes('/commandgroups/')) {
      await fn(argv, client);
      return;
    }

    // find an input arg
    const inputArg = argv.find((a) => a.startsWith('--input=') || a.startsWith('--input-file='));
    if (!inputArg) {
      await fn(argv, client);
      return;
    }
    const inputPath = inputArg.split('=', 2)[1];
    const repos = await parseRepoInput(inputPath);
    if (!Array.isArray(repos) || repos.length <= 1) {
      await fn(argv, client);
      return;
    }

    // determine out dir from argv or default
    const outArg = argv.find((a) => a.startsWith('--out='));
    const outDir = outArg ? outArg.split('=', 2)[1] : `${process.cwd()}/generated`;

    for (const repoFull of repos) {
      const [owner, repo] = repoFull.split('/');
      const safeRepo = repoFull.replace(/[\\/]/g, '_');
      const perRepoInputName = `${path.basename(inputPath, path.extname(inputPath))}-${safeRepo}.json`;
      const perRepoInputPath = await writeNormalizedInput(outDir, perRepoInputName, [repoFull]);

      const perRepoArgv = argv.map((a) => (a.startsWith('--input=') || a.startsWith('--input-file=')) ? `--input=${perRepoInputPath}` : a);
      perRepoArgv.push(`--owner=${owner}`);
      perRepoArgv.push(`--repo=${repo}`);

      await fn(perRepoArgv, client);
    }
  };
}

const _commands: Record<string, CommandRunner> = {
  'branch-protection': makeRunner('../commands/gather-branch-protection.js', 'branchProtectionCommand'),
  'collaborators': makeRunner('../commands/gather-collaborators.js', 'collaboratorsCommand'),
  'repo-secrets': makeRunner('../commands/gather-repo-secrets.js', 'repoSecretsCommand'),
  'remove-forks': makeRunner('../commands/change-remove-remove-forks.js', 'removeForksCommand'),
  'archive-stale-repos': makeRunner('../commands/change-stale-repos.js', 'archiveStaleReposCommand'),
  summary: makeRunner('../commands/summary.js', 'summaryCommand'),
  'categorize-repos': makeRunner('../commands/evaluate-categorize-repos.js', 'categorizeReposCommand'),
  'describe-repo': makeRunner('../commands/describe-repo.js', 'describeRepoCommand'),
  'describe-repos': makeRunner('../commands/evaluate-describe-repos.js', 'describeReposCommand'),
  'delete-empty-repos': makeRunner('../commands/change-remove-empty-repos.js', 'deleteEmptyReposCommand'),
  'evaluate-actions': makeRunner('../commands/evaluate-actions.js', 'evaluateActionsCommand'),
  'evaluate-repos-for-empty': makeRunner('../commands/evaluate-repos-for-empty.js', 'evaluateReposForEmptyCommand'),
  'gather': makeRunner('../commandgroups/gather.js', 'gatherCommand'),
  'evaluate': makeRunner('../commandgroups/evaluate.js', 'evaluateCommand'),
  'change': makeRunner('../commandgroups/change.js', 'changeCommand'),
};
export const commands: Readonly<Record<string, CommandRunner>> = Object.freeze(_commands) as any;

export function availableCommands(): string[] {
  return Object.keys(commands);
}

export async function runCommand(
  name: string | undefined,
  argv: string[],
  client?: GitHubClient,
  registry: Record<string, CommandRunner> = commands,
): Promise<void> {
  if (!name) {
    console.log('gh-cleanup CLI');
    console.log('Commands:', availableCommands().join(', '));
    return;
  }
  const runner = registry[name];
  if (!runner) {
    console.error(`Unknown command: ${name}`);
    console.log('Commands:', availableCommands().join(', '));
    return;
  }
  await runner(argv, client);
}

export default { runCommand, availableCommands };
