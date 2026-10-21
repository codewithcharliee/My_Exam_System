import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const bytes = new Uint8Array(await readFile(join(tmpdir(), 'nuc-law-ccmas.pdf')));
const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
const matches = [];

for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((item) => item.str || '').join(' ');
  if (/elective|course structure|course title|level 100|100 level|500 level/i.test(text)) {
    matches.push(`PAGE ${pageNumber}: ${text.slice(0, 2400)}`);
  }
}

console.log(`PDF pages: ${document.numPages}`);
console.log(matches.slice(0, 30).join('\n'));