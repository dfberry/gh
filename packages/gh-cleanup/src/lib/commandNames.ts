export enum StepCommand {
  CollectActiveRepos = 'collect-active-repos',
  RemoveForks = 'remove-forks',
  ArchiveStaleRepos = 'archive-stale-repos',
  Summary = 'summary',
  CategorizeRepos = 'categorize-repos',
  DescribeRepo = 'describe-repo',
  DescribeRepos = 'describe-repos',
  DeleteEmptyRepos = 'delete-empty-repos',
  EvaluateActions = 'evaluate-actions',
}

export enum GroupCommand {
  Active = 'active',
  All = 'all',
  Evaluate = 'evaluate',
  Maintenance = 'maintenance',
}

export const ALL_COMMANDS = [...Object.values(StepCommand), ...Object.values(GroupCommand)] as string[];

export default { StepCommand, GroupCommand };
