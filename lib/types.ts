// Shared types for the translation system
export interface TranslationJobData {
  originalFilename?: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface TranslationJobResult {
  previewUrl?: string;
  downloadUrl?: string;
  originalText?: string;
  translatedText?: string;
  language?: string;
  wordCount?: number;
}

export interface Job {
  id: string;
  type: 'translate' | 'comic';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  data: TranslationJobData | unknown;
  result?: TranslationJobResult | unknown;
  createdAt: Date;
}