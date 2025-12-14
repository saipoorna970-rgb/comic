import OpenAI from 'openai';
import Replicate from 'replicate';

// Validation helper
const validateApiKeys = () => {
  const missingKeys: string[] = [];
  
  if (!process.env.OPENAI_API_KEY) {
    missingKeys.push('OPENAI_API_KEY');
  }
  
  if (!process.env.REPLICATE_API_TOKEN) {
    missingKeys.push('REPLICATE_API_TOKEN');
  }
  
  if (missingKeys.length > 0) {
    throw new Error(`Missing required API keys: ${missingKeys.join(', ')}. These must be set for the application to function.`);
  }
};

let openaiInstance: OpenAI | null = null;
let replicateInstance: Replicate | null = null;

export const getOpenAI = (): OpenAI => {
  validateApiKeys();
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }
  return openaiInstance;
};

export const getReplicate = (): Replicate => {
  validateApiKeys();
  if (!replicateInstance) {
    replicateInstance = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN!,
    });
  }
  return replicateInstance;
};
