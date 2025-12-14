import { NextRequest, NextResponse } from 'next/server';
import { createJob, updateJob } from '@/lib/jobs';
import { processTranslationJob } from '@/lib/translation-pipeline';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Create upload directory
    const uploadDir = path.join(process.cwd(), 'tmp', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    // Parse form data using built-in Next.js formData()
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF, JPEG, PNG, GIF, or WebP images.' },
        { status: 400 }
      );
    }

    // Save file to temporary location
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uniqueFilename = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadDir, uniqueFilename);
    await fs.promises.writeFile(filePath, buffer);

    // Create job record
    const job = createJob('translate', {
      originalFilename: file.name,
      filePath,
      fileSize: buffer.length,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    });

    // Start processing in background
    processTranslationJob(job.id).catch(async (error) => {
      console.error('Translation job failed:', error);
      updateJob(job.id, {
        status: 'failed',
        result: { error: error.message },
      });
      // Clean up uploaded file
      try {
        await fs.promises.unlink(filePath);
      } catch (cleanupError) {
        console.error('Failed to clean up file:', cleanupError);
      }
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: 'Upload successful. Processing started.',
    });

  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Translation API. Use POST to upload files.' },
    { status: 200 }
  );
}