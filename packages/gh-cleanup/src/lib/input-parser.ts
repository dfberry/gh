import * as fs from 'fs';

/**
 * Parse repository input from a file.
 * Supports both JSON array format and newline-separated format.
 * 
 * @param inputPath - Path to the input file
 * @returns Array of repository full names
 */
export function parseRepoInput(inputPath: string): string[] {
  let repos: string[] = [];
  let raw = '';

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    return repos;
  }

  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read input file "${inputPath}":`, error);
    return repos;
  }
  
  // Try to parse as JSON array first
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) repos = parsed.map(String).filter(Boolean);
    } catch (e) {
      // fall through to newline parsing
    }
  }
  
  // Fallback to newline-separated format
  if (repos.length === 0 && raw.trim().length > 0) {
    repos = raw.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
  }
  
  return repos;
}
