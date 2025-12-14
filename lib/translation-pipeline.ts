import { updateJob } from './jobs';
import { extractTextFromPdf } from './pdf';
import { getOpenAI } from './ai';
import { franc } from 'franc';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TranslationJobData, TranslationJobResult, Job } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Timeout configuration
const TRANSLATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

export const processTranslationJob = async (jobId: string): Promise<void> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Translation timeout')), TRANSLATION_TIMEOUT);
  });

  const processingPromise = processJobInternal(jobId);

  try {
    await Promise.race([processingPromise, timeoutPromise]);
  } catch (error) {
    console.error('Translation job processing failed:', error);
    
    updateJob(jobId, {
      status: 'failed',
      result: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
};

const processJobInternal = async (jobId: string): Promise<void> => {
  try {
    // Update job status to processing
    updateJob(jobId, { status: 'processing', progress: 5 });

    // Load job data
    const job = updateJob(jobId, { progress: 10 });
    if (!job || job.type !== 'translate') {
      throw new Error('Invalid job');
    }

    const data = job.data as TranslationJobData;
    
    // Stage 1: Analyze - Extract text and detect language
    updateJob(jobId, { progress: 20 });
    const analysisResult = await analyzeDocument(data.filePath, data.mimeType);
    
    // Stage 2: Translate
    updateJob(jobId, { progress: 50 });
    const translationResult = await translateContent(analysisResult.text, analysisResult.language);
    
    // Stage 3: Generate PDF
    updateJob(jobId, { progress: 80 });
    await generateTranslatedPdf(
      data.filePath,
      data.mimeType,
      analysisResult.text,
      translationResult.translatedText,
      jobId
    );
    
    // Complete job
    const result: TranslationJobResult = {
      previewUrl: `/api/translate/${jobId}/preview`,
      downloadUrl: `/api/translate/${jobId}/download`,
      originalText: analysisResult.text,
      translatedText: translationResult.translatedText,
      language: analysisResult.language,
      wordCount: analysisResult.wordCount,
    };
    
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      result,
    });

    // Schedule cleanup of temporary files
    scheduleCleanup(jobId, data.filePath);

  } catch (error) {
    console.error('Translation job processing failed:', error);
    
    // Clean up on error
    try {
      const job = updateJob(jobId, {
        status: 'failed',
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      
      if (job) {
        const data = job.data as TranslationJobData;
        await cleanupFiles(data.filePath);
      }
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
  }
};

// Cleanup functions
const scheduleCleanup = (jobId: string, filePath: string) => {
  setTimeout(async () => {
    try {
      await cleanupFiles(filePath);
      console.log(`Cleaned up files for job ${jobId}`);
    } catch (error) {
      console.error(`Cleanup failed for job ${jobId}:`, error);
    }
  }, CLEANUP_TIMEOUT);
};

const cleanupFiles = async (filePath: string) => {
  try {
    // Clean up uploaded file
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }

    // Clean up generated PDF
    const outputPath = filePath.replace('/uploads/', '/outputs/').replace(/\.[^/.]+$/, '-translated.pdf');
    if (fs.existsSync(outputPath)) {
      await fs.promises.unlink(outputPath);
    }
  } catch (error) {
    console.error('File cleanup error:', error);
    throw error;
  }
};

// Background cleanup job to remove old completed/failed jobs
export const startCleanupScheduler = (jobStore: Record<string, Job>) => {
  setInterval(() => {
    try {
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      Object.entries(jobStore).forEach(([jobId, job]) => {
        const jobAge = now.getTime() - job.createdAt.getTime();
        
        if (jobAge > maxAge && (job.status === 'completed' || job.status === 'failed')) {
          // Clean up job record and files
          const data = job.data as TranslationJobData;
          cleanupFiles(data.filePath);
          delete jobStore[jobId];
          
          console.log(`Cleaned up old job: ${jobId}`);
        }
      });
    } catch (error) {
      console.error('Cleanup scheduler error:', error);
    }
  }, 60 * 60 * 1000); // Run every hour
};

const analyzeDocument = async (filePath: string, mimeType: string) => {
  let text = '';
  
  if (mimeType === 'application/pdf') {
    // Extract text from PDF
    const buffer = await fs.promises.readFile(filePath);
    text = await extractTextFromPdf(buffer);
  } else if (mimeType.startsWith('image/')) {
    // For images, we would normally use OCR, but for now we'll return a placeholder
    text = 'Image text extraction would be implemented here using OCR services.';
  }
  
  // Detect language using franc
  const languageCode = franc(text, { minLength: 3 });
  const languageMap: Record<string, string> = {
    'eng': 'English',
    'spa': 'Spanish',
    'fra': 'French',
    'deu': 'German',
    'ita': 'Italian',
    'por': 'Portuguese',
    'rus': 'Russian',
    'jpn': 'Japanese',
    'kor': 'Korean',
    'cmn': 'Chinese',
    'ara': 'Arabic',
    'hin': 'Hindi',
    'tel': 'Telugu',
    'tam': 'Tamil',
    'mal': 'Malayalam',
    'kan': 'Kannada',
    'mar': 'Marathi',
    'guj': 'Gujarati',
    'pan': 'Punjabi',
    'urd': 'Urdu',
  };
  
  const detectedLanguage = languageMap[languageCode] || 'Unknown';
  
  // Clean and prepare text
  const cleanedText = text.trim().replace(/\s+/g, ' ');
  const wordCount = cleanedText.split(' ').length;
  
  return {
    text: cleanedText,
    language: detectedLanguage,
    languageCode,
    wordCount,
  };
};

const translateContent = async (text: string, sourceLanguage: string): Promise<{ translatedText: string }> => {
  // Check if OpenAI client is available
  const openai = getOpenAI();
  if (!openai) {
    console.warn('OpenAI client not available. Using original text as fallback.');
    return {
      translatedText: `[Translation service unavailable] ${text}`,
    };
  }

  // Chunk the text into smaller pieces for translation
  const chunks = chunkText(text, 3000); // 3000 character chunks
  const translatedChunks: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Create translation prompt
    const prompt = `You are a professional translator. Please translate the following text from ${sourceLanguage} to Telugu. 

Important guidelines:
1. Preserve all proper nouns, names, and technical terms
2. Maintain the original tone and style
3. Keep cultural references and context intact
4. Ensure the translation reads naturally in Telugu
5. Preserve formatting, line breaks, and paragraph structure when possible

Text to translate:
${chunk}

Please provide only the Telugu translation:`;
    
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator specializing in high-quality translations that preserve meaning, tone, and cultural context.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });
      
      const translatedChunk = completion.choices[0]?.message?.content?.trim() || chunk;
      translatedChunks.push(translatedChunk);
      
      // Update progress for partial completion would happen here
      // Note: Progress updates happen in the calling function
      
    } catch (error) {
      console.error(`Translation failed for chunk ${i + 1}:`, error);
      translatedChunks.push(chunk); // Fallback to original text
    }
  }
  
  return {
    translatedText: translatedChunks.join('\n\n'),
  };
};

const generateTranslatedPdf = async (
  originalFilePath: string,
  mimeType: string,
  originalText: string,
  translatedText: string,
  jobId: string
) => {
  const outputDir = path.join(process.cwd(), 'tmp', 'outputs');
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const outputPath = path.join(outputDir, `${jobId}-translated.pdf`);
  
  // Create new PDF with translated content
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  
  // Use default font for now - in a real implementation, you'd want to use
  // a Telugu-compatible font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  const margin = 50;
  const maxWidth = width - 2 * margin;
  
  // Add original text in smaller font on left side
  const originalLines = wrapText(originalText, font, fontSize * 0.8, maxWidth * 0.45);
  let yPosition = height - margin;
  
  // Title for original text
  page.drawText('Original:', {
    x: margin,
    y: yPosition,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  yPosition -= fontSize * 1.5;
  
  // Draw original text
  for (const line of originalLines) {
    if (yPosition < margin) break; // Page overflow
    page.drawText(line, {
      x: margin,
      y: yPosition,
      size: fontSize * 0.8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= fontSize * 0.9;
  }
  
  // Add translated text on right side
  yPosition = height - margin;
  page.drawText('Telugu Translation:', {
    x: width / 2 + margin / 2,
    y: yPosition,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  yPosition -= fontSize * 1.5;
  
  // Draw translated text
  const translatedLines = wrapText(translatedText, font, fontSize, maxWidth * 0.45);
  for (const line of translatedLines) {
    if (yPosition < margin) break; // Page overflow
    page.drawText(line, {
      x: width / 2 + margin / 2,
      y: yPosition,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    yPosition -= fontSize * 1.1;
  }
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  await fs.promises.writeFile(outputPath, pdfBytes);
  
  return {
    outputPath,
    previewUrl: `/api/translate/${jobId}/preview`,
    downloadUrl: `/api/translate/${jobId}/download`,
  };
};

const chunkText = (text: string, maxChunkSize: number): string[] => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk + '.');
      }
      currentChunk = trimmedSentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk + '.');
  }
  
  return chunks;
};

const wrapText = (text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, fontSize: number, maxWidth: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
};