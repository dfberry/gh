import * as fs from 'node:fs';
import { join } from 'node:path';
/**
 * Resolve an output file path given an `--out` value that may be a directory.
 * If `outArg` points to an existing directory, returns `join(outArg, outPrefix + defaultFilename)`.
 * If `outArg` points to a file path (or doesn't exist) returns `outArg` as-is.
 */
export function resolveOutFile(outArg: string | undefined, outPrefix: string | undefined, defaultFilename: string): string | undefined {
  if (!outArg) return undefined;
  try {
    const st = fs.statSync(outArg);
    if (st.isDirectory()) {
      const prefix = outPrefix || '';
      return join(outArg, `${prefix}${defaultFilename}`);
    }
    return outArg;
  } catch (e) {
    // path doesn't exist (or stat failed) — assume caller intended a filepath
    return outArg;
  }
}
export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error(`Failed to create directory "${dir}":`, e);
  }
}

export default ensureDir;
