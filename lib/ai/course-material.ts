const MAX_COURSE_MATERIAL_FILE_SIZE = 10 * 1024 * 1024;
const MAX_COURSE_MATERIAL_CHARACTERS = 50_000;
export const COURSE_MATERIAL_ACCEPT =
  '.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.txt,.md,.csv,.html';
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  'docx',
  'pptx',
  'xlsx',
  'odt',
  'odp',
  'ods',
  'pdf',
  'rtf',
  'md',
  'html',
  'csv',
]);
const SUPPORTED_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv']);

export async function extractCourseMaterial(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isPlainText = extension !== undefined && SUPPORTED_TEXT_EXTENSIONS.has(extension);

  if (!extension || (!isPlainText && !SUPPORTED_DOCUMENT_EXTENSIONS.has(extension))) {
    throw new Error(
      'Unsupported file type. Upload PDF, DOCX, PPTX, XLSX, OpenDocument, RTF, TXT, Markdown, CSV, HTML, EPUB, or TeX.',
    );
  }
  if (file.size > MAX_COURSE_MATERIAL_FILE_SIZE) {
    throw new Error('Course material files must be 10 MB or smaller.');
  }

  let text: string;
  if (isPlainText) {
    text = await file.text();
  } else {
    try {
      const { parseOffice } = await import('officeparser');
      const document = await parseOffice(file);
      text = (await document.to('text')).value;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown document parsing error.';
      throw new Error(
        `Could not extract text from ${file.name}. Check that the file is valid and not password-protected. ${reason}`,
      );
    }
  }

  const extractedText = text.trim();
  if (!extractedText) {
    throw new Error(
      'No readable text was found. Scanned PDFs and image-only documents need OCR before they can be used.',
    );
  }
  if (extractedText.length > MAX_COURSE_MATERIAL_CHARACTERS) {
    throw new Error(
      'Extracted course material must be 50,000 characters or fewer. Split it into smaller files or paste only the relevant sections.',
    );
  }

  return extractedText;
}
