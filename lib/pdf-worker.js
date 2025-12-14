#!/usr/bin/env node
// Standalone PDF text extraction worker
// This runs as a separate process to avoid webpack bundling issues

const fs = require('fs');

// DOMMatrix polyfill for Node.js environment
globalThis.DOMMatrix = globalThis.DOMMatrix || class DOMMatrix {
  constructor() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1;
    this.e = 0; this.f = 0;
  }
  
  translate(x, y) {
    this.e += x;
    this.f += y;
    return this;
  }
  
  rotate(angle) {
    const cos = Math.cos(angle * Math.PI / 180);
    const sin = Math.sin(angle * Math.PI / 180);
    const a = this.a * cos + this.c * sin;
    const b = this.b * cos + this.d * sin;
    const c = this.c * cos - this.a * sin;
    const d = this.d * cos - this.b * sin;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return this;
  }
  
  scale(scaleX, scaleY) {
    scaleY = scaleY || scaleX;
    this.a *= scaleX; this.b *= scaleX; this.c *= scaleY; this.d *= scaleY;
    return this;
  }
};

async function extractTextFromPdf(buffer) {
  try {
    // Import pdf-parse in worker context
    const pdfParse = require('pdf-parse');
    const parser = new pdfParse.PDFParse({ data: buffer });
    const data = await parser.getText();
    return data.text;
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
}

// Handle command line arguments
if (require.main === module) {
  const input = process.stdin;
  let buffer = '';
  
  input.on('data', (chunk) => {
    buffer += chunk;
  });
  
  input.on('end', async () => {
    try {
      const pdfBuffer = Buffer.from(buffer, 'base64');
      const text = await extractTextFromPdf(pdfBuffer);
      process.stdout.write(JSON.stringify({ success: true, text }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ success: false, error: error.message }));
    }
  });
}

module.exports = { extractTextFromPdf };