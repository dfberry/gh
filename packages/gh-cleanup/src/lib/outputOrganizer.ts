/**
 * Output Organizer
 *
 * Small utility to centralize how generated output files and folders are named.
 * Developers can edit `defaultConfig` to control where command-group and
 * command-specific outputs are placed. Functions here compute output paths
 * consistently for the CLI and for any scripts that write into `generated/`.
 */

export type CommandGroup = string | null;

export interface OutputConfig {
  // Root directory where outputs are written (usually './generated')
  rootDir: string;
  // Folder name used for metadata / summaries that are not tied to a group
  metaFolderName: string;
  // Mapping of command-group -> subfolder name under rootDir
  groupFolders: Record<string, string>;
  // Default folder when a group is not found in groupFolders
  defaultGroupFolder: string;
}

export const defaultConfig: OutputConfig = {
  rootDir: './generated',
  metaFolderName: '',
  groupFolders: {
    'gh-cleanup': 'gh-cleanup',
    'evaluate': 'evaluate',
    'maintenance': 'maintenance'
  },
  defaultGroupFolder: ''
};

export interface OutputOptions {
  // command group that produced the file (e.g. 'gh-cleanup' or 'maintenance')
  group?: CommandGroup;
  // specific command name (e.g. 'active', 'describe-repos')
  command?: string;
  // explicit filename (if present, returned path will include it)
  filename?: string;
  // optional output prefix (commonly used by the CLI for step scoping)
  outPrefix?: string;
  // allow override of the config (useful in tests)
  config?: Partial<OutputConfig>;
}

function joinPath(...parts: string[]) {
  return parts.filter(Boolean).join('/');
}

export function makeConfig(override?: Partial<OutputConfig>): OutputConfig {
  return {
    ...defaultConfig,
    ...(override || {})
  };
}

export function resolveGroupFolder(cfg: OutputConfig, group?: CommandGroup) {
  if (!group) return cfg.metaFolderName;
  return cfg.groupFolders[group] ?? cfg.defaultGroupFolder;
}

/**
 * Compute a target output path for a generated file.
 * Examples:
 *  - meta summary: getOutputPath({ filename: 'catalog.md' }) => './generated/meta/catalog.md'
 *  - group commands: getOutputPath({ group: 'gh-cleanup', filename: 'active.json' }) => './generated/gh-cleanup/active.json'
 *  - with prefix: getOutputPath({ group: 'gh-cleanup', outPrefix: 'active', filename: 'summary.json' }) => './generated/gh-cleanup/active-summary.json'
 */
export function getOutputPath(opts: OutputOptions): string {
  const cfg = makeConfig(opts.config);
  const folder = resolveGroupFolder(cfg, opts.group);

  let baseName = '';
  if (opts.outPrefix) {
    baseName += opts.outPrefix;
  }
  if (opts.command) {
    if (baseName) baseName += '-';
    baseName += opts.command;
  }
  // If caller supplied an explicit filename, use it, optionally prefixed
  if (opts.filename) {
    // If filename already contains the prefix, don't duplicate
    if (baseName) {
      const prefixed = `${baseName}-${opts.filename}`;
      return joinPath(cfg.rootDir, folder, prefixed);
    }
    return joinPath(cfg.rootDir, folder, opts.filename);
  }

  // Fallback filename when none provided
  const fallback = baseName || 'output.json';
  return joinPath(cfg.rootDir, folder, fallback);
}

export default {
  defaultConfig,
  makeConfig,
  getOutputPath,
  resolveGroupFolder
};
