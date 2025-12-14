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
    const formData = await request.formData();

    const styleRaw = formData.get('visualStyle');
    const visualStyle = (typeof styleRaw === 'string' ? styleRaw : 'manga') as ComicVisualStyle;
    if (!ALLOWED_STYLES.includes(visualStyle)) {
      return NextResponse.json(
        {
          error: `Invalid visualStyle. Allowed: ${ALLOWED_STYLES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const panelCountRaw = parseIntField(formData.get('panelCount'));
    const panelCount = panelCountRaw ?? 6;
    if (panelCount < 4 || panelCount > 8) {
      return NextResponse.json(
        { error: 'panelCount must be between 4 and 8.' },
        { status: 400 }
      );
    }

    const panelsPerPageRaw = parseIntField(formData.get('panelsPerPage'));
    const panelsPerPage = (panelsPerPageRaw ?? 4) as ComicJobData['panelsPerPage'];
    if (![2, 4, 6].includes(panelsPerPage)) {
      return NextResponse.json(
        { error: 'panelsPerPage must be one of: 2, 4, 6.' },
        { status: 400 }
      );
    }

    const textRaw = formData.get('text');
    const storyText = typeof textRaw === 'string' ? textRaw : '';

    const file = formData.get('file') as File | null;

    if (!file && !storyText.trim()) {
      return NextResponse.json({ error: 'Provide either text or a PDF file.' }, { status: 400 });
    }

    if (file && file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 100MB.' }, { status: 400 });
    }

    // Determine input type and validate word count for text inputs early.
    let data: ComicJobData;

    if (storyText.trim()) {
      const wc = countWords(storyText);
      if (wc > MAX_WORDS) {
        return NextResponse.json({ error: `Text too long. Max ${MAX_WORDS} words.` }, { status: 400 });
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
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      const allowedTypes = ['application/pdf', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload a PDF or provide text.' },
          { status: 400 }
        );
      }

      const uploadDir = path.join(process.cwd(), 'tmp', 'uploads');
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large. Max 100MB.' }, { status: 400 });
      }

      if (file.type === 'text/plain') {
        const txt = buffer.toString('utf-8');
        const wc = countWords(txt);
        if (wc > MAX_WORDS) {
          return NextResponse.json({ error: `Text too long. Max ${MAX_WORDS} words.` }, { status: 400 });
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
              { error: `PDF text too long. Max ${MAX_WORDS} words.` },
              { status: 400 }
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

    const job = createJob('comic', data);

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
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: 'Comic job created. Processing started.',
    });
  } catch (error) {
    console.error('Comic upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: 'Comic API. Use POST with form-data: {text|file} and options (visualStyle, panelCount, panelsPerPage).',
    },
    { status: 200 }
  );
}
