import * as path from 'path';

export function getDefaultOutDir(): string {
  // Allow overriding via env for CI or user preference
  if (process.env.GH_CLEANUP_OUT && process.env.GH_CLEANUP_OUT.length > 0) {
    return process.env.GH_CLEANUP_OUT;
  }
  return path.join(process.cwd(), 'generated');
}

export const DEFAULT_OUT_DIR = getDefaultOutDir();
