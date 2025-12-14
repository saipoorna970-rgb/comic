// Shared types for the processing system

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
  error?: string;
}

export type ComicVisualStyle =
  | 'manga'
  | 'indian-comic'
  | 'cinematic'
  | 'watercolor'
  | 'noir';

export interface ComicJobData {
  originalFilename?: string;
  inputType: 'text' | 'pdf';
  mimeType: 'text/plain' | 'application/pdf';
  uploadedAt: string;

  storyText?: string;
  filePath?: string;
  fileSize?: number;

  panelCount: number; // total panels/scenes
  panelsPerPage: 2 | 4 | 6;
  visualStyle: ComicVisualStyle;
}

export interface ComicPanelResult {
  index: number;
  sceneTitle?: string;
  sceneDescription: string;
  dialogueTelugu: string;
  imagePrompt: string;
  replicateImageUrl?: string;
  previewUrl?: string;
}

export interface ComicJobResult {
  previewUrl?: string;
  downloadUrl?: string;

  summary?: string;
  panels?: ComicPanelResult[];

  error?: string;
}

export interface Job {
  id: string;
  type: 'translate' | 'comic';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: string;
  progress: number;
  data: TranslationJobData | ComicJobData | unknown;
  result?: TranslationJobResult | ComicJobResult | unknown;
  createdAt: Date;
}
