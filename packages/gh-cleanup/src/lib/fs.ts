import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Ensure the directory for the given file path exists (creates parents). */
export async function ensureDirForFile(filePath: string | undefined) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  if (!dir || dir === '.') return;
  await fs.mkdir(dir, { recursive: true });
}

export default { ensureDirForFile };
