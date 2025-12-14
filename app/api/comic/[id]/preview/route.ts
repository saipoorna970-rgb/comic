import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = getJob(params.id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return NextResponse.json({ error: 'Job not completed yet' }, { status: 400 });
    }

    const outputDir = path.join(process.cwd(), 'tmp', 'outputs');
    const pdfPath = path.join(outputDir, `${params.id}-comic.pdf`);

    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json({ error: 'Generated PDF not found' }, { status: 404 });
    }

    const pdfBuffer = await fs.promises.readFile(pdfPath);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="comic-preview.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Comic preview failed:', error);
    return NextResponse.json(
      { error: 'Preview failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
