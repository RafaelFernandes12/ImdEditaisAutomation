import OpenAI from 'openai';

export const openAIClient = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY ?? 'local',
});
