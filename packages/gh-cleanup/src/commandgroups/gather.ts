import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type GatherArgs = GroupArgs;

export function parseArgs(argv: string[]): GatherArgs {
  return parseGroupArgs(argv) as GatherArgs;
}

export async function runCommand(_client: any, args: GatherArgs): Promise<any> {
  const steps = [
    { name: 'gather-branch-protection', module: '../commands/security.js', wrapper: 'gatherBranchProtectionCommand' },
    { name: 'gather-collaborators', module: '../commands/security.js', wrapper: 'gatherCollaboratorsCommand' },
    { name: 'gather-repo-secrets', module: '../commands/security.js', wrapper: 'gatherRepoSecretsCommand' },
    { name: 'gather-security', module: '../commands/security.js', wrapper: 'gatherSecurityCommand' },
    { name: 'gather-alerts', module: '../commands/alerts.js', wrapper: 'gatherAlertsCommand' },
    { name: 'gather-actions', module: '../commands/actions.js', wrapper: 'gatherActionsCommand' },
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
