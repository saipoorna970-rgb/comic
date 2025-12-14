# Translation Pipeline API Documentation

This document describes the translation pipeline API endpoints for handling PDF and image translation to Telugu.

## Overview

The translation pipeline provides endpoints to upload documents, monitor translation progress, and download translated results. The system supports PDF files and images (JPEG, PNG, GIF, WebP) up to 100MB in size.

## API Endpoints

### 1. Upload Document for Translation

**Endpoint:** `POST /api/translate`

**Description:** Upload a PDF or image file for translation to Telugu.

**Request:**
- Content-Type: `multipart/form-data`
- Body: Form data with `file` field containing the uploaded file

**Supported File Types:**
- PDF files: `application/pdf`
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**File Size Limit:** 100MB

**Response:**
```json
{
  "jobId": "abc123",
  "status": "pending",
  "progress": 0,
  "message": "Upload successful. Processing started."
}
```

**Error Responses:**
- 400: Invalid file type or missing file
- 500: Upload failed

### 2. Check Job Status

**Endpoint:** `GET /api/translate/{jobId}/status`

**Description:** Check the status and progress of a translation job.

**Query Parameters:**
- `Accept: text/event-stream` - Enable Server-Sent Events for real-time updates
- `X-Event-Source: true` - Alternative header for SSE

**Response (JSON):**
```json
{
  "jobId": "abc123",
  "status": "processing",
  "progress": 65,
  "type": "translate",
  "createdAt": "2024-12-14T10:30:00Z",
  "data": {
    "originalFilename": "document.pdf",
    "fileSize": 1024000,
    "mimeType": "application/pdf"
  },
  "result": {
    "originalText": "Extracted text...",
    "language": "English",
    "wordCount": 2500
  }
}
```

**Response (SSE):**
```
event: connect
data: {"jobId":"abc123","timestamp":"2024-12-14T10:30:00Z"}

event: status
data: {"jobId":"abc123","status":"processing","progress":65,...}

event: complete
data: {"jobId":"abc123","status":"completed","result":{...}}
```

**Error Responses:**
- 404: Job not found
- 500: Status check failed

### 3. Preview Translation

**Endpoint:** `GET /api/translate/{jobId}/preview`

**Description:** Preview the translated PDF document inline.

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `inline; filename="preview.pdf"`

**Error Responses:**
- 400: Job not completed yet
- 404: Job not found or PDF not found
- 500: Preview failed

### 4. Download Translation

**Endpoint:** `GET /api/translate/{jobId}/download`

**Description:** Download the translated PDF document as an attachment.

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="{original-filename}-telugu-translation.pdf"`
- Content-Length: {fileSize}

**Error Responses:**
- 400: Job not completed yet
- 404: Job not found or PDF not found
- 500: Download failed

## Processing Pipeline

### Stage 1: Upload and Validation
- File is parsed using streaming parser
- File type and size validation
- Job record created in memory store
- Temporary file stored in `/tmp/uploads/`

### Stage 2: Analysis
- Text extraction from PDF using `pdf-parse`
- OCR processing for images (placeholder implemented)
- Language detection using `franc` library
- Text cleaning and preprocessing

### Stage 3: Translation
- Text chunking for large documents
- GPT-4o API calls with structured prompts
- Prompt engineering to preserve names, tone, and cultural references
- Chunked processing to handle API rate limits

### Stage 4: PDF Generation
- New PDF creation using `pdf-lib`
- Original and translated text side-by-side layout
- Telugu text embedding (placeholder implementation)
- Output saved to `/tmp/outputs/`

## Error Handling

### Timeouts
- Translation timeout: 10 minutes
- File cleanup: 24 hours after completion
- Background cleanup scheduler runs every hour

### Cleanup
- Temporary uploaded files cleaned up on completion/failure
- Generated PDFs cleaned up after 24 hours
- Failed jobs and files cleaned up automatically

### Error Recovery
- Graceful degradation on translation API failures
- Fallback to original text on translation errors
- Comprehensive error logging and user feedback

## Status Values

- `pending`: Job created, waiting for processing
- `processing`: Job is being processed
- `completed`: Job completed successfully
- `failed`: Job failed with error

## Progress Tracking

Progress values range from 0-100 and indicate completion percentage:
- 0-10: Upload and initialization
- 10-30: Document analysis and text extraction
- 30-70: Translation processing
- 70-90: PDF generation
- 90-100: Finalization and cleanup

## Environment Variables

Required environment variables:
- `OPENAI_API_KEY`: OpenAI API key for GPT-4o access
- `REPLICATE_API_TOKEN`: Replicate API token (if using OCR services)

## Testing

Test files are provided in the `/tests` directory:
- `translation-pipeline.test.ts`: Unit tests for core functionality
- `integration.test.ts`: Integration tests for API endpoints

Run tests with your preferred Node.js testing framework:
```bash
npm test
# or
yarn test
# or
vitest
```

## Security Considerations

- File type validation prevents malicious uploads
- File size limits prevent abuse
- Temporary file cleanup prevents disk space exhaustion
- Input sanitization in text processing
- Rate limiting recommended for production deployment

## Performance Notes

- Streaming file upload for large files
- Chunked translation processing
- Background job processing
- Automatic cleanup prevents resource leaks
- Memory-efficient text processing