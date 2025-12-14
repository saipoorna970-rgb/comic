import { PDFDocument } from 'pdf-lib';
import { spawn } from 'child_process';

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  try {
    return new Promise((resolve, reject) => {
      // Spawn a child process to handle PDF parsing
      const worker = spawn('node', ['lib/pdf-worker.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Send PDF buffer as base64 to worker
      const base64Buffer = buffer.toString('base64');
      worker.stdin.write(base64Buffer);
      worker.stdin.end();
      
      // Handle worker output
      let output = '';
      worker.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      
      worker.on('close', (code) => {
        try {
          if (code === 0) {
            const result = JSON.parse(output);
            if (result.success) {
              resolve(result.text);
            } else {
              reject(new Error(result.error));
            }
          } else {
            reject(new Error(`PDF worker process exited with code ${code}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse worker output: ${error}`));
        }
      });
      
      // Handle worker errors
      worker.on('error', (error) => {
        reject(new Error(`PDF worker error: ${error.message}`));
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        worker.kill();
        reject(new Error('PDF extraction timeout'));
      }, 30000);
    });
  } catch (error) {
    console.error('PDF parsing failed:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const createPdf = async (): Promise<PDFDocument> => {
  return await PDFDocument.create();
};
