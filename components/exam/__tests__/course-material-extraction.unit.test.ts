import { describe, expect, it } from 'vitest';
import { extractCourseMaterial } from '@/lib/ai/course-material';

function createFile(name: string, content: string): File {
  return new File([content], name);
}

describe('course material extraction', () => {
  it('reads plain-text course material', async () => {
    await expect(extractCourseMaterial(createFile('notes.TXT', '  Lecture notes  '))).resolves.toBe(
      'Lecture notes',
    );
  });

  it('rejects unsupported file types', async () => {
    await expect(extractCourseMaterial(createFile('notes.doc', 'document'))).rejects.toThrow(
      'Unsupported file type',
    );
  });

  it('reports when a supported document cannot be parsed', async () => {
    await expect(extractCourseMaterial(createFile('notes.docx', 'not a Word document'))).rejects.toThrow(
      'Could not extract text from notes.docx',
    );
  });

  it('rejects empty and oversized extracted text', async () => {
    await expect(extractCourseMaterial(createFile('empty.txt', ' \n '))).rejects.toThrow(
      'No readable text was found',
    );
    await expect(extractCourseMaterial(createFile('long.txt', 'x'.repeat(50_001)))).rejects.toThrow(
      '50,000 characters or fewer',
    );
  });

  it('rejects files over the upload size limit', async () => {
    const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf');

    await expect(extractCourseMaterial(largeFile)).rejects.toThrow('10 MB or smaller');
  });
});
