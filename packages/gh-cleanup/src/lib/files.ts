import * as fs from 'fs';

export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error(`Failed to create directory "${dir}":`, e);
  }
}

export default ensureDir;
