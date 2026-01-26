import type { GitHubClient } from 'github-rest';
import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs, Step } from './base.js';

export type EvaluateArgs = GroupArgs;

export function parseArgs(argv: string[]): EvaluateArgs {
  return parseGroupArgs(argv) as EvaluateArgs;
}

export async function runCommand(_client: GitHubClient, args: EvaluateArgs): Promise<{ step: string; repos: string[]; timestamp: string; summary: any; mode: string }> {
  const steps: Step[] = [
    { name: 'evaluate-categorize-repos', module: '../commands/evaluate-categorize-repos.js', wrapper: 'categorizeReposCommand' },
    { name: 'evaluate-describe-repos', module: '../commands/evaluate-describe-repos.js', wrapper: 'describeReposCommand' },
    { name: 'evaluate-actions', module: '../commands/evaluate-actions.js', wrapper: 'evaluateActionsCommand' },
  ];

  return runGroupCommand(args, {
    groupName: 'evaluate',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-evaluate-input.json',
    defaultOutPrefix: 'evaluate-dryrun',
    steps,
  }, _client);
}

export async function writeOutput(result: any, args: EvaluateArgs): Promise<void> {
  return writeGroupOutput(result, args, 'evaluate', 'evaluate-dryrun');
}

export async function evaluateCommand(argv: string[], client?: GitHubClient): Promise<void> {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const result = await runCommand(client, args);
  await writeOutput(result, args);
  console.log('evaluate: completed');
}
