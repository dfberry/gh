import * as fs from 'fs/promises';
import { ensureDir } from './files.js';

export async function writeNormalizedInput(outDir: string, normalizedInputSuffix: string, repos: unknown): Promise<string> {
  await ensureDir(outDir);
  const normalizedInputPath = `${outDir}/${normalizedInputSuffix}`;
  try {
    await fs.writeFile(normalizedInputPath, JSON.stringify(repos, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write normalized input file "${normalizedInputPath}":`, e);
  }
  return normalizedInputPath;
}

export default writeNormalizedInput;
