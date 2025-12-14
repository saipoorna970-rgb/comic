import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  return data.text;
};

export const createPdf = async (): Promise<PDFDocument> => {
  return await PDFDocument.create();
};
