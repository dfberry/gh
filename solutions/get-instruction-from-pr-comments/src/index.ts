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
  llmConfig?: LLMConfig;
  maxComments?: number; // Maximum comments to include (default: 40)
  summaryMode?: boolean; // If true, only include comment summaries not full bodies
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
 * For LLM processing, we only need the actual comment content (body)
 * and minimal context (author, timestamp). Everything else is metadata overhead.
 * @param comment - Full review comment object from GitHub API
 * @returns Cleaned comment with only fields needed for LLM processing
 */
function cleanCommentFields(comment: any): any {
  return {
    author: comment.user?.login,
    body: comment.body,
    created_at: comment.created_at
  };
}

/**
 * Calculates importance score for a comment based on heuristics
 * Higher scores = more important comments to include
 * @param comment - Cleaned comment object
 * @param authorFrequency - How many times this author has commented (higher = more weight)
 * @returns Importance score (0-100)
 */
function scoreCommentImportance(comment: any, authorFrequency: number = 1): number {
  let score = 0;

  // Author frequency: more active reviewers have more weight
  // Scale frequency to max 30 points
  score += Math.min(authorFrequency * 5, 30);

  // Length: longer, more detailed comments are usually more important
  const bodyLength = comment.body?.length || 0;
  if (bodyLength > 500) score += 20;
  else if (bodyLength > 200) score += 10;
  else if (bodyLength > 50) score += 5;

  // Comments with code blocks (```...) are usually more technical/important
  if (comment.body?.includes('```')) score += 10;

  // Comments with URLs/links are usually referencing important resources
  if (comment.body?.includes('http')) score += 5;

  return Math.min(score, 100);
}

/**
 * Filter comments to keep only the most important ones
 * Uses importance scoring based on author frequency and content quality
 * @param comments - Array of cleaned comments
 * @param maxComments - Maximum number of comments to keep
 * @returns Top N most important comments
 */
function filterMostImportantComments(comments: any[], maxComments: number): any[] {
  if (comments.length <= maxComments) {
    return comments;
  }

  // Calculate how many times each author has commented
  const authorFrequency = new Map<string, number>();
  comments.forEach(c => {
    const author = c.author || 'unknown';
    authorFrequency.set(author, (authorFrequency.get(author) || 0) + 1);
  });

  // Score all comments using author frequency
  const scored = comments.map(c => ({
    comment: c,
    score: scoreCommentImportance(c, authorFrequency.get(c.author || 'unknown') || 1)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Keep top N comments, then re-sort by date to maintain chronological order
  return scored
    .slice(0, maxComments)
    .map(s => s.comment)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Clean and reduce the PR comments JSON for LLM processing
 * 
 * This function:
 * 1. Filters out all bot comments
 * 2. Keeps only essential fields from human comments
 * 3. Optionally filters to most important comments only
 * 4. Reduces JSON size for faster LLM processing
 * 
 * @param prComments - Raw PR comments from GitHub API
 * @param maxComments - Maximum comments to keep per type (default: 40)
 * @param summaryMode - If true, only include comment summaries
 * @returns Cleaned PR comments with only human feedback and essential fields
 */
export function cleanPRComments(
  prComments: PRCommentsInput,
  maxComments: number = 40,
  summaryMode: boolean = false
): PRCommentsInput {
  // Filter review comments: remove bots, keep only essential fields
  let cleanedReviewComments = prComments.reviewComments
    .filter(comment => !isBot(comment.user?.login))
    .map(cleanCommentFields);

  // Issue comments are usually automated, but include them if they exist and aren't from bots
  let cleanedIssueComments = prComments.issueComments
    .filter(comment => !isBot(comment.user?.login))
    .map(cleanCommentFields);

  const originalReviewCount = cleanedReviewComments.length;
  const originalIssueCount = cleanedIssueComments.length;

  // Filter to most important comments if count exceeds limit
  if (cleanedReviewComments.length > maxComments) {
    cleanedReviewComments = filterMostImportantComments(cleanedReviewComments, maxComments);
  }

  if (cleanedIssueComments.length > maxComments) {
    cleanedIssueComments = filterMostImportantComments(cleanedIssueComments, maxComments);
  }

  // In summary mode, truncate comment bodies to first 300 chars
  if (summaryMode) {
    cleanedReviewComments = cleanedReviewComments.map(c => ({
      ...c,
      body: c.body?.substring(0, 300) + (c.body?.length > 300 ? '...' : '') || ''
    }));
    cleanedIssueComments = cleanedIssueComments.map(c => ({
      ...c,
      body: c.body?.substring(0, 300) + (c.body?.length > 300 ? '...' : '') || ''
    }));
  }

  console.log(`Cleaned PR comments: ${cleanedReviewComments.length} review comments (from ${originalReviewCount}), ${cleanedIssueComments.length} issue comments (from ${originalIssueCount})`);
  console.log(`Filtered out ${prComments.reviewComments.length - originalReviewCount} bot review comments`);
  console.log(`Filtered out ${prComments.issueComments.length - originalIssueCount} bot issue comments`);
  if (cleanedReviewComments.length < originalReviewCount || cleanedIssueComments.length < originalIssueCount) {
    console.log(`Additionally filtered to most important comments (max ${maxComments} per type)`);
  }
  if (summaryMode) {
    console.log('Summary mode: comment bodies truncated to 300 chars');
  }

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
 * and returns the generated instructions.
 * 
 * @param options - Configuration options for generating instructions
 * @param options.jsonFile - Path to the JSON file containing PR comments
 * @param options.systemPrompt - System prompt text to set LLM behavior/context
 * @param options.userPrompt - User prompt text describing the task
 * @param options.llmConfig - Optional LLM configuration (model, temperature, etc.)
 * @returns The generated instructions as a string
 * @throws Error if the JSON file cannot be read or parsed
 */
export async function generateInstructions(options: GenerateInstructionsOptions): Promise<string> {
  const { jsonFile, systemPrompt, userPrompt, llmConfig, maxComments = 40, summaryMode = false } = options;

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

  // Read the PR comments JSON file from disk
  // This file should contain issueComments and reviewComments arrays
  const jsonContent = await fs.promises.readFile(jsonFile, 'utf8');
  const prComments: PRCommentsInput = JSON.parse(jsonContent);

  // Clean the PR comments to remove bots and reduce JSON size
  // Also filter to most important comments and optionally use summary mode
  const cleanedComments = cleanPRComments(prComments, maxComments, summaryMode);

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

  return result;
}
