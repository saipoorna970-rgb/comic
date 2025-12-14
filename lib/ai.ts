import OpenAI from 'openai';
import Replicate from 'replicate';

// Lazy initialization to prevent build-time API key errors
let openaiInstance: OpenAI | null = null;
let replicateInstance: Replicate | null = null;

export const getOpenAI = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
};

export const getReplicate = (): Replicate | null => {
  if (!process.env.REPLICATE_API_TOKEN) {
    return null;
  }
  
  if (!replicateInstance) {
    replicateInstance = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
  }
  return replicateInstance;
};
