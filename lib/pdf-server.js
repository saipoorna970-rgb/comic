// Server-side only PDF processing module
// This module is loaded dynamically to avoid webpack bundling issues

let domMatrixInitialized = false;

function initializeDOMMatrix() {
  if (!domMatrixInitialized) {
    // Set up DOMMatrix polyfill before any pdf-parse imports
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
    domMatrixInitialized = true;
  }
}

async function extractTextFromPdf(buffer) {
  try {
    // Initialize DOMMatrix before importing pdf-parse
    initializeDOMMatrix();
    
    // Use CommonJS require to avoid webpack bundling
    const pdfParse = require('pdf-parse');
    const parser = new pdfParse.PDFParse({ data: buffer });
    const data = await parser.getText();
    return data.text;
  } catch (error) {
    console.error('PDF parsing failed:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
}

module.exports = {
  extractTextFromPdf,
  initializeDOMMatrix
};