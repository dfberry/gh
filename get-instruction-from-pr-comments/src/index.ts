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
 * Generate instructions from PR comments using LLM
 */
export async function generateInstructions(options: GenerateInstructionsOptions): Promise<string> {
  const { jsonFile, systemPrompt, userPrompt, outputFile, llmConfig } = options;

  // Read PR comments JSON
  const jsonContent = await fs.promises.readFile(jsonFile, 'utf8');
  const prComments: PRCommentsInput = JSON.parse(jsonContent);

  // Build the full prompt
  const commentsJson = JSON.stringify(prComments, null, 2);
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nPR Comments JSON:\n${commentsJson}`;

  // Call LLM
  const result = await callOpenAI(fullPrompt, llmConfig, { name: 'pr-comments-to-instructions' });

  // Write output if specified
  if (outputFile) {
    await fs.promises.writeFile(outputFile, result, 'utf8');
  }

  return result;
}
