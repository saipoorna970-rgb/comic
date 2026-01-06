// DOMMatrix polyfill for Node.js environment - MUST be at the very top
// before any other imports that might eventually pull in pdfjs-dist
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a: number; b: number; c: number; d: number; e: number; f: number;
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1;
      this.e = 0; this.f = 0;
    }
    
    translate(x: number, y: number) {
      this.e += x;
      this.f += y;
      return this;
    }
    
    rotate(angle: number) {
      const cos = Math.cos(angle * Math.PI / 180);
      const sin = Math.sin(angle * Math.PI / 180);
      const a = this.a * cos + this.c * sin;
      const b = this.b * cos + this.d * sin;
      const c = this.c * cos - this.a * sin;
      const d = this.d * cos - this.b * sin;
      this.a = a; this.b = b; this.c = c; this.d = d;
      return this;
    }
    
    scale(scaleX: number, scaleY?: number) {
      const sY = scaleY || scaleX;
      this.a *= scaleX;
      this.b *= scaleX;
      this.c *= sY;
      this.d *= sY;
      return this;
    }
  };
}

import { PDFDocument } from 'pdf-lib';

/**
 * Extracts text from a PDF buffer using pdf-parse.
 * This implementation includes a DOMMatrix polyfill and uses dynamic imports
 * to ensure compatibility with Node.js environments and avoid bundling issues.
 */
export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  try {
    // Dynamic import to ensure the polyfill is already in place
    // and to help with compatibility in different environments
    const pdfModule = await import('pdf-parse');
    const pdfAny = pdfModule as any;
    
    // Handle different export patterns (CommonJS vs ESM)
    // pdf-parse is traditionally a CommonJS module
    const defaultExport = pdfAny.default || pdfAny;
    
    // Support for the interface seen in pdf-worker.js
    const PDFParse = pdfAny.PDFParse || (pdfAny.default && pdfAny.default.PDFParse);
    if (PDFParse && typeof PDFParse === 'function') {
      try {
        const parser = new (PDFParse as any)({ data: buffer });
        if (typeof parser.getText === 'function') {
          const data = await parser.getText();
          return data.text;
        }
      } catch (e) {
        console.warn('Attempted PDFParse constructor usage failed, falling back to standard function:', e);
      }
    }

    // Try standard usage
    if (typeof defaultExport === 'function') {
      const data = await defaultExport(buffer);
      return data.text;
    }

    throw new Error('pdf-parse does not export a valid function or PDFParse class');
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const createPdf = async (): Promise<PDFDocument> => {
  return await PDFDocument.create();
};
