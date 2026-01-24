import * as fs from 'fs';
import { ensureDir } from './files.js';

export function writeNormalizedInput(outDir: string, normalizedInputSuffix: string, repos: unknown): string {
  ensureDir(outDir);
  const normalizedInputPath = `${outDir}/${normalizedInputSuffix}`;
  try {
    fs.writeFileSync(normalizedInputPath, JSON.stringify(repos, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write normalized input file "${normalizedInputPath}":`, e);
  }
  return normalizedInputPath;
}

export default writeNormalizedInput;
