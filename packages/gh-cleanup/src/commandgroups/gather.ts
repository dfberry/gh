import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type GatherArgs = GroupArgs;

export function parseArgs(argv: string[]): GatherArgs {
  return parseGroupArgs(argv) as GatherArgs;
}

export async function runCommand(_client: any, args: GatherArgs): Promise<any> {
  const steps = [
    { name: 'branch-protection', module: '../commands/gather-branch-protection.js', wrapper: 'branchProtectionCommand' },
    { name: 'user-repos', module: '../commands/gather-user-repos.js', wrapper: 'gatherUserReposCommand' },
    { name: 'collaborators', module: '../commands/gather-collaborators.js', wrapper: 'collaboratorsCommand' },
    { name: 'repo-secrets', module: '../commands/gather-repo-secrets.js', wrapper: 'repoSecretsCommand' },
    { name: 'actions', module: '../commands/gather-actions.js', wrapper: 'actionsCommand' },
    { name: 'gather-root-contents', module: '../commands/gather-root-contents.js', wrapper: 'gatherRootContentsCommand' },
    { name: 'gather-root-readme', module: '../commands/gather-root-readme.js', wrapper: 'gatherRootReadmeCommand' },
    { name: 'summary', module: '../commands/summary.js', wrapper: 'summaryCommand' },
  ];
  return runGroupCommand(args, {
    groupName: 'gather',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-gather-input.json',
    defaultOutPrefix: 'gather-dryrun',
    steps,
  });
}

export async function writeOutput(result: any, args: GatherArgs): Promise<void> {
  return writeGroupOutput(result, args, 'gather', 'gather-dryrun');
}

export async function gatherCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('gather: completed');
}
