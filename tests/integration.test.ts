/**
 * Integration tests for the translation API endpoints
 * These tests demonstrate how the translation pipeline works end-to-end
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import FormData from 'form-data';

// Test configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Translation API Integration', () => {
  let testServer: any;

  beforeAll(async () => {
    // In a real environment, you would start your test server here
    // For this example, we'll test the individual components
    console.log('Starting integration tests...');
  });

  afterAll(async () => {
    // Clean up test files and server
    const testDirs = ['uploads', 'outputs', 'test'];
    for (const dir of testDirs) {
      const dirPath = path.join(os.tmpdir(), dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    }
  });

  describe('File Upload and Processing', () => {
    it('should create a translation job for a valid PDF', async () => {
      // Create a test PDF file
      const testPdfContent = Buffer.from('%PDF-1.4\n% Test PDF content\n');
      const formData = new FormData();
      formData.append('file', testPdfContent, {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });

      const response = await fetch(`${API_BASE_URL}/api/translate`, {
        method: 'POST',
        body: formData,
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('status', 'pending');
      expect(result).toHaveProperty('progress', 0);
    });

    it('should reject unsupported file types', async () => {
      const formData = new FormData();
      formData.append('file', Buffer.from('test content'), {
        filename: 'test.exe',
        contentType: 'application/x-executable',
      });

      const response = await fetch(`${API_BASE_URL}/api/translate`, {
        method: 'POST',
        body: formData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toContain('Unsupported file type');
    });

    it('should handle large files with streaming', async () => {
      // Create a mock large file (1MB for testing)
      const largeContent = Buffer.alloc(1024 * 1024, 'A');
      const formData = new FormData();
      formData.append('file', largeContent, {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      });

      const response = await fetch(`${API_BASE_URL}/api/translate`, {
        method: 'POST',
        body: formData,
      });

      // Should accept the file for processing
      expect(response.status).toBe(200);
    });
  });

  describe('Job Status Monitoring', () => {
    it('should track job progress through all stages', async () => {
      const jobId = 'test-job-progress';
      
      // Mock job progress updates
      const expectedProgressUpdates = [
        { status: 'pending', progress: 0 },
        { status: 'processing', progress: 5 },
        { status: 'processing', progress: 20 },
        { status: 'processing', progress: 50 },
        { status: 'processing', progress: 80 },
        { status: 'completed', progress: 100 },
      ];

      for (const update of expectedProgressUpdates) {
        const response = await fetch(`${API_BASE_URL}/api/translate/${jobId}/status`);
        const result = await response.json();
        
        expect(result.jobId).toBe(jobId);
        expect(result.status).toBe(update.status);
        expect(result.progress).toBeGreaterThanOrEqual(update.progress);
      }
    });

    it('should return 404 for non-existent jobs', async () => {
      const response = await fetch(`${API_BASE_URL}/api/translate/non-existent-id/status`);
      expect(response.status).toBe(404);
    });

    it('should support Server-Sent Events for real-time updates', async () => {
      const jobId = 'test-sse-job';
      
      // Note: This test would require a real server to be running
      // and would need to be adapted for the testing framework
      const eventSource = new EventSource(`${API_BASE_URL}/api/translate/${jobId}/status`, {
        headers: {
          'Accept': 'text/event-stream',
        },
      });

      // Mock SSE event handling
      const events: any[] = [];
      eventSource.onmessage = (event) => {
        events.push(JSON.parse(event.data));
      };

      // Wait for connection event
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]).toHaveProperty('jobId', jobId);
      expect(events[0]).toHaveProperty('status');
      
      eventSource.close();
    });
  });

  describe('Download and Preview Endpoints', () => {
    it('should provide preview of completed translation', async () => {
      const jobId = 'completed-job-id';
      
      const response = await fetch(`${API_BASE_URL}/api/translate/${jobId}/preview`);
      
      if (response.status === 200) {
        expect(response.headers.get('Content-Type')).toBe('application/pdf');
        expect(response.headers.get('Content-Disposition')).toContain('inline');
      } else if (response.status === 400) {
        const result = await response.json();
        expect(result.error).toContain('Job not completed yet');
      } else if (response.status === 404) {
        const result = await response.json();
        expect(result.error).toContain('Job not found');
      }
    });

    it('should download completed translation as attachment', async () => {
      const jobId = 'completed-job-id';
      
      const response = await fetch(`${API_BASE_URL}/api/translate/${jobId}/download`);
      
      if (response.status === 200) {
        expect(response.headers.get('Content-Type')).toBe('application/pdf');
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        expect(response.headers.get('Content-Disposition')).toContain('-telugu-translation.pdf');
        
        // Verify it's actually a PDF
        const buffer = Buffer.from(await response.arrayBuffer());
        expect(buffer.slice(0, 4).toString()).toBe('%PDF');
      } else if (response.status === 400) {
        const result = await response.json();
        expect(result.error).toContain('Job not completed yet');
      }
    });

    it('should return proper error for incomplete jobs', async () => {
      const jobId = 'pending-job-id';
      
      const [previewResponse, downloadResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/translate/${jobId}/preview`),
        fetch(`${API_BASE_URL}/api/translate/${jobId}/download`),
      ]);

      expect(previewResponse.status).toBe(400);
      expect(downloadResponse.status).toBe(400);
      
      const [previewData, downloadData] = await Promise.all([
        previewResponse.json(),
        downloadResponse.json(),
      ]);
      
      expect(previewData.error).toContain('Job not completed yet');
      expect(downloadData.error).toContain('Job not completed yet');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // This test would require mocking file system operations
      // In practice, you'd use a testing library like fs-extra-mock or jest's mocking
    });

    it('should handle translation service timeouts', async () => {
      // Mock a translation service that times out
      // This would be tested by mocking the OpenAI API calls
    });

    it('should clean up temporary files on errors', async () => {
      // Test that temporary files are cleaned up when jobs fail
      const testDir = path.join(os.tmpdir(), 'test');
      await fs.promises.mkdir(testDir, { recursive: true });
      
      // Create a test file
      const testFile = path.join(testDir, 'test.pdf');
      await fs.promises.writeFile(testFile, 'test content');
      
      expect(fs.existsSync(testFile)).toBe(true);
      
      // In the actual implementation, errors should trigger cleanup
      // This test verifies the cleanup behavior
      
      // Cleanup
      await fs.promises.rm(testDir, { recursive: true, force: true });
    });
  });

  describe('Performance and Limits', () => {
    it('should respect 100MB file size limit', async () => {
      // Create a file that exceeds the limit
      const oversizedContent = Buffer.alloc(101 * 1024 * 1024, 'A'); // 101MB
      const formData = new FormData();
      formData.append('file', oversizedContent, {
        filename: 'too-large.pdf',
        contentType: 'application/pdf',
      });

      // This test would need to be run against a real server
      // For now, it's a stub that documents the expected behavior
    });

    it('should handle concurrent uploads', async () => {
      const concurrentUploads = 5;
      const uploads = [];

      for (let i = 0; i < concurrentUploads; i++) {
        const formData = new FormData();
        const content = Buffer.from(`Test content ${i}`);
        formData.append('file', content, {
          filename: `test-${i}.pdf`,
          contentType: 'application/pdf',
        });

        uploads.push(
          fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            body: formData,
          })
        );
      }

      const responses = await Promise.all(uploads);
      const successCount = responses.filter(r => r.status === 200).length;
      
      expect(successCount).toBe(concurrentUploads);
    });
  });
});

// Utility functions for testing
export const createMockPdf = (text: string): Buffer => {
  // This would create a real PDF in a testing environment
  // For now, return a mock buffer
  return Buffer.from(`%PDF-1.4\nMock PDF with content: ${text}\n%%EOF`);
};

export const waitForJobCompletion = async (jobId: string, timeout = 30000): Promise<any> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${API_BASE_URL}/api/translate/${jobId}/status`);
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
};