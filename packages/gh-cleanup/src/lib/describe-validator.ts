export type DescribeOutput = {
  short_description: string;
  long_description: string;
  topics: string[];
  suggested_readme_sections?: string[];
  topic_rationale?: Record<string, string>;
};

export function validateDescribeOutput(obj: unknown): DescribeOutput {
  if (!obj || typeof obj !== 'object') throw new Error('Invalid LLM output: expected object');
  const anyObj = obj as any;
  if (typeof anyObj.short_description !== 'string') throw new Error('Invalid LLM output: short_description missing or not string');
  if (anyObj.short_description.length > 100) throw new Error('short_description exceeds 100 characters');
  if (typeof anyObj.long_description !== 'string') throw new Error('Invalid LLM output: long_description missing or not string');
  if (!Array.isArray(anyObj.topics)) throw new Error('Invalid LLM output: topics missing or not array');
  if (anyObj.topics.length > 20) throw new Error('topics exceed 20 items');
  for (const t of anyObj.topics) if (typeof t !== 'string') throw new Error('Invalid LLM output: topic not string');
  if (anyObj.suggested_readme_sections && !Array.isArray(anyObj.suggested_readme_sections)) throw new Error('suggested_readme_sections must be an array');
  if (anyObj.topic_rationale && typeof anyObj.topic_rationale !== 'object') throw new Error('topic_rationale must be an object');
  return anyObj as DescribeOutput;
}
