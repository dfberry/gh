export type BaseFlags = {
  yes?: boolean;
  force?: boolean;
  out?: string;
  input?: string;
  audit?: boolean;
  debug?: boolean;
  debugDir?: string | undefined;
  owner?: string;
  repo?: string;
  branch?: string;
};

export function parseBaseFlags(argv: string[]): BaseFlags {
  const args: BaseFlags = { yes: argv.includes('--yes'), force: argv.includes('--force'), out: '', audit: true, debug: argv.includes('--debug'), debugDir: undefined };
  for (const a of argv) {
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a.startsWith('--input=')) args.input = a.split('=')[1];
    if (a === '--no-audit') args.audit = false;
    if (a === '--audit') args.audit = true;
    if (a === '--debug') args.debug = true;
    if (a.startsWith('--debug-dir=')) args.debugDir = a.split('=')[1];
    if (a.startsWith('--owner=')) args.owner = a.split('=')[1];
    if (a.startsWith('--repo=')) args.repo = a.split('=')[1];
    if (a.startsWith('--branch=')) args.branch = a.split('=')[1];
  }
  return args;
}

export default { parseBaseFlags };
