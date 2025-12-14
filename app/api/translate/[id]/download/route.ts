import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TranslationJobResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = getJob(params.id);
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job not completed yet' },
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const result = job.result as TranslationJobResult;
    if (!result?.downloadUrl) {
      return NextResponse.json(
        { error: 'No download available' },
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Construct the PDF file path
    const outputDir = path.join(os.tmpdir(), 'outputs');
    const pdfPath = path.join(outputDir, `${params.id}-translated.pdf`);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json(
        { error: 'Generated PDF not found' },
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Read the PDF file
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    
    // Extract filename from original job data or use default
    const originalFilename = (job.data as { originalFilename?: string })?.originalFilename || 'document';
    const downloadFilename = originalFilename.replace(/\.[^/.]+$/, '') + '-telugu-translation.pdf';

    // Return the PDF file
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Download failed:', error);
    return NextResponse.json(
      { 
        error: 'Download failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}