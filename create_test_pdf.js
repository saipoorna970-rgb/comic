const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function createTestPDF() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 600]);
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  
  const text = 'Test Document\n\nThis is a simple test PDF for translation.\n\nHello World!';
  const fontSize = 12;
  const textWidth = timesRomanFont.widthOfTextAtSize(text, fontSize);
  const textHeight = timesRomanFont.heightAtSize(fontSize);
  
  page.drawText(text, {
    x: 50,
    y: 500,
    size: fontSize,
    font: timesRomanFont,
  });
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', pdfBytes);
  console.log('Created test.pdf');
}

createTestPDF().catch(console.error);
