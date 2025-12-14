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
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('Form data parsing failed:', error);
      return NextResponse.json(
        { 
          error: 'Failed to parse upload data', 
          details: error instanceof Error ? error.message : 'Invalid form data' 
        },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate file type - PDF only (no image support yet)
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF files only.' },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate file size
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      return NextResponse.json(
        { error: 'File too large. Maximum size is 100MB.' },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Save file to temporary location with timeout
    let bytes: ArrayBuffer;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('File upload timeout')), 30000); // 30 second timeout
      });
      
      const uploadPromise = file.arrayBuffer();
      bytes = await Promise.race([uploadPromise, timeoutPromise]);
    } catch (error) {
      console.error('File reading failed:', error);
      return NextResponse.json(
        { 
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
    const uniqueFilename = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadDir, uniqueFilename);
    
    try {
      await fs.promises.writeFile(filePath, buffer);
    } catch (error) {
      console.error('File writing failed:', error);
      return NextResponse.json(
        { 
          error: 'Failed to save uploaded file', 
          details: error instanceof Error ? error.message : 'Storage error' 
        },
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Create job record
    let job;
    try {
      job = createJob('translate', {
        originalFilename: file.name,
        filePath,
        fileSize: buffer.length,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Job creation failed:', error);
      // Clean up file if job creation fails
      try {
        await fs.promises.unlink(filePath);
      } catch (cleanupError) {
        console.error('Failed to clean up file after job creation failure:', cleanupError);
      }
      return NextResponse.json(
        { 
          error: 'Failed to create translation job', 
          details: error instanceof Error ? error.message : 'Job creation error' 
        },
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

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
      success: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: 'Upload successful. Processing started.',
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload failed:', error);
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
    { message: 'Translation API. Use POST to upload files.' },
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}