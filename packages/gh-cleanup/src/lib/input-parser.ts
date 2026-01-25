import { promises as fs } from 'fs';

/**
 * Parse repository input from a file.
 * Supports both JSON array format and newline-separated format.
 * 
 * @param inputPath - Path to the input file
 * @returns Array of repository full names
 */
export async function parseRepoInput(inputPath: string): Promise<string[]> {
  const repos: string[] = [];
  if (!inputPath) return repos;

  let raw = '';
  try {
    await fs.access(inputPath);
  } catch (err) {
    console.error(`Input file not found: ${inputPath}`);
    return repos;
  }

  try {
    raw = await fs.readFile(inputPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read input file "${inputPath}":`, error);
    return repos;
  }

  // Try to parse as JSON array first
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (e) {
      console.warn(
        'Failed to parse repository input as JSON array; falling back to newline-separated format:',
        e instanceof Error ? e.message : e
      );
    }
  }

  // Fallback to newline-separated format
  if (raw.trim().length > 0) {
    return raw.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
  }

  return repos;
}
