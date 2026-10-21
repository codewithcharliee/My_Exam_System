import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import AIToolsPage from '@/app/(dashboard)/dashboard/ai-tools/page';

describe('AI Tools generation limits', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows live course-material and question-count maximums', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      courses: [{ id: 'course-1', code: 'LAW201', title: 'Constitutional Law' }],
    }), { headers: { 'Content-Type': 'application/json' } })));

    render(<AIToolsPage />);
    await expect.element(page.getByText('0 / 200,000 characters')).toBeVisible();
    await expect.element(page.getByText('5 / 50 questions')).toBeVisible();

    const material = page.getByPlaceholder('Paste relevant lecture notes, cases, or course material here.');
    await material.fill('Synthetic course notes');
    await expect.element(page.getByText('22 / 200,000 characters')).toBeVisible();

    const count = page.getByRole('spinbutton');
    await count.fill('');
    await expect.element(page.getByText('Max 50 questions')).toBeVisible();
    await count.fill('25');
    await expect.element(page.getByText('25 / 50 questions')).toBeVisible();
  });

  it('adds an individual generated draft to the course question bank', async () => {
    const generatedResult = {
      status: 'completed',
      result: {
        questions: [{
          text: 'Which principle separates the branches of government?',
          type: 'multiple_choice',
          difficulty: 'medium',
          options: [
            { text: 'Separation of powers', isCorrect: true },
            { text: 'Parliamentary sovereignty', isCorrect: false },
            { text: 'Collective responsibility', isCorrect: false },
            { text: 'Federal supremacy', isCorrect: false },
          ],
        }],
        draftIds: ['draft-law-question-1'],
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/courses') {
        return new Response(JSON.stringify({ courses: [{ id: 'course-1', code: 'LAW100', title: 'Legal Methods', level: 'LLB 100' }] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/ai/generate-questions') {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(generatedResult)}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url === '/api/questions/draft-law-question-1' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'draft-law-question-1', status: 'approved' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AIToolsPage />);
    await page.getByPlaceholder('e.g. Constitutional law and judicial review').fill('Separation of powers');
    await page.getByPlaceholder('Paste relevant lecture notes, cases, or course material here.').fill('Synthetic Law 100 course notes.');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect.element(page.getByText(/Q1: Which principle separates the branches of government\?/)).toBeVisible();
    await page.getByRole('button', { name: 'Add to question bank' }).click();
    await expect.element(page.getByRole('button', { name: 'Added to question bank' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/draft-law-question-1', expect.objectContaining({ method: 'PATCH' }));
  });
});