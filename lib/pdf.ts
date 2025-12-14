import { PDFDocument } from 'pdf-lib';

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  try {
    // Dynamic import to avoid webpack bundling issues
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    return data.text;
  } catch (error) {
    console.error('PDF parsing failed:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const createPdf = async (): Promise<PDFDocument> => {
  return await PDFDocument.create();
};
