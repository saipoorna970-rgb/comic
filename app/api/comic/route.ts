import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createJob, updateJob } from '@/lib/jobs';
import { processComicJob } from '@/lib/comic-pipeline';
import { extractTextFromPdf } from '@/lib/pdf';
import type { ComicJobData, ComicVisualStyle } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_WORDS = 10_000;

const ALLOWED_STYLES: ComicVisualStyle[] = [
  'manga',
  'indian-comic',
  'cinematic',
  'watercolor',
  'noir',
];

const parseIntField = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== 'string') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('Form data parsing failed:', error);
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to parse upload data', 
          details: error instanceof Error ? error.message : 'Invalid form data' 
        },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const styleRaw = formData.get('visualStyle');
    const visualStyle = (typeof styleRaw === 'string' ? styleRaw : 'manga') as ComicVisualStyle;
    if (!ALLOWED_STYLES.includes(visualStyle)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid visualStyle. Allowed: ${ALLOWED_STYLES.join(', ')}`,
        },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const panelCountRaw = parseIntField(formData.get('panelCount'));
    const panelCount = panelCountRaw ?? 6;
    if (panelCount < 4 || panelCount > 8) {
      return NextResponse.json(
        { success: false, error: 'panelCount must be between 4 and 8.' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const panelsPerPageRaw = parseIntField(formData.get('panelsPerPage'));
    const panelsPerPage = (panelsPerPageRaw ?? 4) as ComicJobData['panelsPerPage'];
    if (![2, 4, 6].includes(panelsPerPage)) {
      return NextResponse.json(
        { success: false, error: 'panelsPerPage must be one of: 2, 4, 6.' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const textRaw = formData.get('text');
    const storyText = typeof textRaw === 'string' ? textRaw : '';

    const file = formData.get('file') as File | null;

    if (!file && !storyText.trim()) {
      return NextResponse.json(
        { success: false, error: 'Provide either text or a PDF file.' }, 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (file) {
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'File is empty' }, 
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: 'File too large. Max 100MB.' }, 
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Determine input type and validate word count for text inputs early.
    let data: ComicJobData;

    if (storyText.trim()) {
      const wc = countWords(storyText);
      if (wc > MAX_WORDS) {
        return NextResponse.json(
          { success: false, error: `Text too long. Max ${MAX_WORDS} words.` }, 
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      data = {
        inputType: 'text',
        mimeType: 'text/plain',
        uploadedAt: new Date().toISOString(),
        storyText,
        panelCount,
        panelsPerPage,
        visualStyle,
      };
    } else {
      // File-based input
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file uploaded' }, 
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const allowedTypes = ['application/pdf', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: 'Unsupported file type. Please upload a PDF or provide text.' },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const uploadDir = path.join(process.cwd(), 'tmp', 'uploads');
      await fs.promises.mkdir(uploadDir, { recursive: true });

      let bytes: ArrayBuffer;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('File upload timeout')), 30000);
        });
        
        const uploadPromise = file.arrayBuffer();
        bytes = await Promise.race([uploadPromise, timeoutPromise]);
      } catch (error) {
        console.error('File reading failed:', error);
        return NextResponse.json(
          { 
            success: false,
            error: 'Failed to read uploaded file', 
            details: error instanceof Error ? error.message : 'File upload timeout' 
          },
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const buffer = Buffer.from(bytes);

      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: 'File too large. Max 100MB.' }, 
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (file.type === 'text/plain') {
        const txt = buffer.toString('utf-8');
        const wc = countWords(txt);
        if (wc > MAX_WORDS) {
          return NextResponse.json(
            { success: false, error: `Text too long. Max ${MAX_WORDS} words.` }, 
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        data = {
          originalFilename: file.name,
          inputType: 'text',
          mimeType: 'text/plain',
          uploadedAt: new Date().toISOString(),
          storyText: txt,
          panelCount,
          panelsPerPage,
          visualStyle,
        };
      } else {
        const uniqueFilename = `${Date.now()}-${file.name}`;
        const filePath = path.join(uploadDir, uniqueFilename);
        await fs.promises.writeFile(filePath, buffer);

        // Validate PDF word-count early to avoid creating jobs that will immediately fail.
        try {
          const extracted = await extractTextFromPdf(buffer);
          const wc = countWords(extracted);
          if (wc > MAX_WORDS) {
            await fs.promises.unlink(filePath);
            return NextResponse.json(
              { success: false, error: `PDF text too long. Max ${MAX_WORDS} words.` },
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (err) {
          // If parsing fails, still allow job to proceed; pipeline will handle failure.
          console.warn('PDF validation extraction failed; continuing:', err);
        }

        data = {
          originalFilename: file.name,
          inputType: 'pdf',
          mimeType: 'application/pdf',
          uploadedAt: new Date().toISOString(),
          filePath,
          fileSize: buffer.length,
          panelCount,
          panelsPerPage,
          visualStyle,
        };
      }
    }

    let job;
    try {
      job = createJob('comic', data);
    } catch (error) {
      console.error('Job creation failed:', error);
      // Clean up file if job creation fails
      const filePath = (data as ComicJobData).filePath;
      if (filePath) {
        try {
          await fs.promises.unlink(filePath);
        } catch (cleanupError) {
          console.error('Failed to clean up file after job creation failure:', cleanupError);
        }
      }
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to create comic job', 
          details: error instanceof Error ? error.message : 'Job creation error' 
        },
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    processComicJob(job.id).catch(async (error) => {
      console.error('Comic job failed:', error);
      updateJob(job.id, {
        status: 'failed',
        stage: 'failed',
        progress: 100,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      const filePath = (data as ComicJobData).filePath;
      if (filePath) {
        try {
          await fs.promises.unlink(filePath);
        } catch (cleanupError) {
          console.error('Failed to clean up file:', cleanupError);
        }
      }
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: 'Comic job created. Processing started.',
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Comic upload failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Upload failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: 'Comic API. Use POST with form-data: {text|file} and options (visualStyle, panelCount, panelsPerPage).',
    },
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
