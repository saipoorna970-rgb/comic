import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getJob } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; panel: string } }
) {
  try {
    const job = getJob(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const panelIndex = Number.parseInt(params.panel, 10);
    if (!Number.isFinite(panelIndex) || panelIndex < 0) {
      return NextResponse.json({ error: 'Invalid panel index' }, { status: 400 });
    }

    const comicDir = path.join(os.tmpdir(), 'comic', params.id, 'panels');
    const filename = `panel-${String(panelIndex).padStart(3, '0')}.png`;
    const imagePath = path.join(comicDir, filename);

    if (!fs.existsSync(imagePath)) {
      return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
    }

    const buffer = await fs.promises.readFile(imagePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Panel preview failed:', error);
    return NextResponse.json(
      { error: 'Panel preview failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
