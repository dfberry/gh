/**
 * Default number of days used to classify a repository as "stale".
 *
 * This value is used by commands like `archive-stale-repos` and `summary` as
 * the default cutoff (when `--older-than-days` is not provided). Keep this
 * value in one place so it's obvious and easy to change for all commands.
 */
export const DEFAULT_STALE_DAYS = 365;
