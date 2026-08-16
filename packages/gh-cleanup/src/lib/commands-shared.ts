import { readJsonFile } from './files.js';

export type GatherActionsEntry = {
  owner: string;
  repo: string;
  details?: any;
  status: string;
  message?: string | {} | null;
};

// TBD - this should only be called in base
// continue to look for where it is used outside bsee and remove those calls and fix those
// command files
export async function readInputRepos(inputJsonPath?: string): Promise<string[]> {
  if (!inputJsonPath) throw new Error('Input file path is required to read input repositories.');

  // if extension isn't .json, throw error
if (!inputJsonPath.endsWith('.json')) {
    throw new Error('Input file must be a JSON file with .json extension.');
}

  // Try structured JSON first
  const json = await readJsonFile<any>(inputJsonPath);

  if (Array.isArray(json) && json.length ==0){
    throw new Error('Expected input JSON to contain a single array of repository identifiers.');
  }
 
  return json;
}

export default readInputRepos;
