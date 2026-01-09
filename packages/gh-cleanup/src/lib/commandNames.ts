export enum CommandName {
  RemoveForks = 'remove-forks',
  ArchiveStaleRepos = 'archive-stale-repos',
  Summary = 'summary',
  CategorizeRepos = 'categorize-repos',
  DescribeRepo = 'describe-repo',
  DescribeRepos = 'describe-repos',
  DeleteEmptyRepos = 'delete-empty-repos',
  EvaluateActions = 'evaluate-actions',
  Active = 'active',
  All = 'all',
  Evaluate = 'evaluate',
  Maintenance = 'maintenance',
}

export const ALL_COMMANDS = Object.values(CommandName) as string[];

export default CommandName;
