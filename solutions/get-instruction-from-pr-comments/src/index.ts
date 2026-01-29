import { callOpenAI, type LLMConfig } from 'llm-completion';
import * as fs from 'fs';

export interface PRCommentsInput {
  issueComments: any[];
  reviewComments: any[];
}

export interface GenerateInstructionsOptions {
  jsonFile: string;
  systemPrompt: string;
  userPrompt: string;
  outputFile?: string;
  llmConfig?: LLMConfig;
}

/**
 * Known bot account names to filter out
 */
const BOT_ACCOUNTS = new Set([
  'acrolinx-bot',
  'policheck',
  'policheck-bot',
  'learn-build-bot',
  'learn-build-service',
  'dependabot',
  'renovate-bot',
  'github-actions',
  'github-actions[bot]',
  'codecov-commenter',
  'codecov',
  'azure-sdk',
  'azure-sdk-bot',
  'msdn-site-admin'
]);

/**
 * Checks if a user account is a bot
 * @param login - GitHub user login name
 * @returns true if the account appears to be a bot
 */
function isBot(login: string): boolean {
  if (!login) return true;
  
  // Check against known bot list
  if (BOT_ACCOUNTS.has(login.toLowerCase())) {
    return true;
  }
  
  // Check for common bot naming patterns
  if (
    login.toLowerCase().includes('[bot]') ||
    login.toLowerCase().includes('-bot') ||
    login.toLowerCase().endsWith('bot') ||
    login.toLowerCase().includes('_bot_')
  ) {
    return true;
  }
  
  return false;
}

/**
 * Extract only the relevant fields from a review comment
 * This reduces the JSON size significantly for LLM processing
 * @param comment - Full review comment object from GitHub API
 * @returns Cleaned comment with only essential fields
 */
function cleanCommentFields(comment: any): any {
  return {
    id: comment.id,
    user: {
      login: comment.user?.login,
      type: comment.user?.type
    },
    body: comment.body,
    created_at: comment.created_at,
    author_association: comment.author_association,
    path: comment.path,
    diff_hunk: comment.diff_hunk,
    html_url: comment.html_url
  };
}

/**
 * Clean and reduce the PR comments JSON for LLM processing
 * 
 * This function:
 * 1. Filters out all bot comments
 * 2. Keeps only essential fields from human comments
 * 3. Reduces JSON size for faster LLM processing
 * 
 * @param prComments - Raw PR comments from GitHub API
 * @returns Cleaned PR comments with only human feedback and essential fields
 */
export function cleanPRComments(prComments: PRCommentsInput): PRCommentsInput {
  // Filter review comments: remove bots, keep only essential fields
  const cleanedReviewComments = prComments.reviewComments
    .filter(comment => !isBot(comment.user?.login))
    .map(cleanCommentFields);

  // Issue comments are usually automated, but include them if they exist and aren't from bots
  const cleanedIssueComments = prComments.issueComments
    .filter(comment => !isBot(comment.user?.login))
    .map(cleanCommentFields);

  console.log(`Cleaned PR comments: ${cleanedReviewComments.length} review comments, ${cleanedIssueComments.length} issue comments`);
  console.log(`Filtered out ${prComments.reviewComments.length - cleanedReviewComments.length} bot review comments`);
  console.log(`Filtered out ${prComments.issueComments.length - cleanedIssueComments.length} bot issue comments`);

  return {
    issueComments: cleanedIssueComments,
    reviewComments: cleanedReviewComments
  };
}

/**
 * Generate instructions from PR comments using LLM
 * 
 * This function reads a JSON file containing PR comments (both issue comments and review comments),
 * constructs a prompt using provided system and user prompt templates, sends it to an LLM,
 * and optionally writes the generated instructions to an output file.
 * 
 * @param options - Configuration options for generating instructions
 * @param options.jsonFile - Path to the JSON file containing PR comments
 * @param options.systemPrompt - System prompt text to set LLM behavior/context
 * @param options.userPrompt - User prompt text describing the task
 * @param options.outputFile - Optional path to write the generated instructions
 * @param options.llmConfig - Optional LLM configuration (model, temperature, etc.)
 * @returns The generated instructions as a string
 * @throws Error if the JSON file cannot be read or parsed
 */
export async function generateInstructions(options: GenerateInstructionsOptions): Promise<string> {
  const { jsonFile, systemPrompt, userPrompt, outputFile, llmConfig } = options;

  // Validate all required parameters are provided and non-empty
  if (!jsonFile || typeof jsonFile !== 'string' || jsonFile.trim() === '') {
    throw new Error('jsonFile parameter is required and must be a non-empty string');
  }
  
  if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
    throw new Error('systemPrompt parameter is required and must be a non-empty string');
  }
  
  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
    throw new Error('userPrompt parameter is required and must be a non-empty string');
  }

  // Verify the JSON file exists before attempting to read it
  try {
    await fs.promises.access(jsonFile, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`JSON file not found or not readable: ${jsonFile}\nCurrent working directory: ${process.cwd()}`);
  }

  // Verify the output directory exists if outputFile is specified
  if (outputFile) {
    const outputDir = outputFile.substring(0, outputFile.lastIndexOf('/'));
    if (outputDir) {
      try {
        await fs.promises.access(outputDir, fs.constants.W_OK);
      } catch (error) {
        throw new Error(`Output directory not found or not writable: ${outputDir}\nCurrent working directory: ${process.cwd()}`);
      }
    }
  }

  // Read the PR comments JSON file from disk
  // This file should contain issueComments and reviewComments arrays
  const jsonContent = await fs.promises.readFile(jsonFile, 'utf8');
  const prComments: PRCommentsInput = JSON.parse(jsonContent);

  // Clean the PR comments to remove bots and reduce JSON size
  const cleanedComments = cleanPRComments(prComments);

  // Construct the complete LLM prompt by combining:
  // 1. System prompt (sets the LLM's role and context)
  // 2. User prompt (describes the specific task)
  // 3. PR comments JSON (provides the data to analyze)
  const commentsJson = JSON.stringify(cleanedComments, null, 2);
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nPR Comments JSON:\n${commentsJson}`;

  // Log prompt size for debugging
  console.log(`Original JSON size: ${JSON.stringify(prComments).length} characters`);
  console.log(`Cleaned JSON size: ${commentsJson.length} characters (~${Math.round(commentsJson.length / 4)} tokens)`);
  console.log(`Compression: ${Math.round((1 - commentsJson.length / JSON.stringify(prComments).length) * 100)}% reduction`);
  console.log(`Full prompt: ${fullPrompt.length} characters (~${Math.round(fullPrompt.length / 4)} tokens)`);

  // Send the prompt to the LLM and get the generated instructions
  // The 'name' field helps identify this operation in logs/traces
  console.log('Calling LLM API...');
  const startTime = Date.now();
  const result = await callOpenAI(fullPrompt, llmConfig, { name: 'pr-comments-to-instructions' });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`LLM call completed in ${duration}s, response length: ${result.length} chars`);

  // Optionally persist the generated instructions to a file
  // This is useful for review, version control, or further processing
  if (outputFile) {
    await fs.promises.writeFile(outputFile, result, 'utf8');
  }

  return result;
}
