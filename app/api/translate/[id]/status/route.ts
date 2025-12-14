import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

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
        { status: 404 }
      );
    }

    // Check if client wants Server-Sent Events
    const acceptHeader = request.headers.get('accept');
    const eventSource = request.headers.get('x-event-source');
    
    if (acceptHeader?.includes('text/event-stream') || eventSource === 'true') {
      return handleSSE(request, job.id);
    }
    
    // Regular JSON response for polling
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      type: job.type,
      createdAt: job.createdAt,
      data: job.data,
      result: job.result,
    });

  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json(
      { error: 'Status check failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

const handleSSE = async (request: NextRequest, jobId: string): Promise<NextResponse> => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      const connectMessage = `event: connect\ndata: ${JSON.stringify({ jobId, timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(connectMessage));
      
      // Polling function to check job status
      const checkStatus = async () => {
        try {
          const job = getJob(jobId);
          
          if (job) {
            const message = `event: status\ndata: ${JSON.stringify({
              jobId: job.id,
              status: job.status,
              progress: job.progress,
              type: job.type,
              createdAt: job.createdAt,
              data: job.data,
              result: job.result,
            })}\n\n`;
            
            controller.enqueue(encoder.encode(message));
            
            // Close connection when job is completed or failed
            if (job.status === 'completed' || job.status === 'failed') {
              const finalMessage = `event: complete\ndata: ${JSON.stringify({
                jobId: job.id,
                status: job.status,
                result: job.result,
              })}\n\n`;
              
              controller.enqueue(encoder.encode(finalMessage));
              controller.close();
              return;
            }
          }
        } catch (error) {
          console.error('SSE status check failed:', error);
          const errorMessage = `event: error\ndata: ${JSON.stringify({
            error: 'Failed to check job status',
            details: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`;
          
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
          return;
        }
      };
      
      // Initial check
      checkStatus();
      
      // Set up polling interval (every 2 seconds)
      const intervalId = setInterval(checkStatus, 2000);
      
      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
};