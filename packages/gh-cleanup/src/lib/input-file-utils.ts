import * as fs from 'fs';
import * as path from 'path';

export function resolveInputFilePath(inputFile?: string, input?: string, defaultInput?: string): string {
  const chosen = inputFile || input || defaultInput || '';
  if (!chosen) return chosen;
  // If the chosen path is not absolute, resolve relative to cwd
  const resolved = path.isAbsolute(chosen) ? chosen : path.resolve(process.cwd(), chosen);
  return resolved;
}

export function computeOutPrefixFromInput(inputPath: string | undefined, defaultPrefix: string): string {
  if (!inputPath) return defaultPrefix;
  try {
    const base = path.basename(inputPath);
    const name = base.replace(/\.[^.]+$/, '');
    return name || defaultPrefix;
  } catch (e) {
    return defaultPrefix;
  }
}

export async function readJsonInput<T = any>(inputPath: string): Promise<T | null> {
  try {
    if (!fs.existsSync(inputPath)) return null;
    const raw = fs.readFileSync(inputPath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (e) {
    return null;
  }
}

export function computeNormalizedInputPathName(inputPath: string, suffix: string): string {
  // Produce a filename based on the input basename plus provided suffix
  const base = path.basename(inputPath).replace(/\.[^.]+$/, '');
  return `${base}${suffix}`;
}
