import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import GradingPage from '@/app/(dashboard)/dashboard/grading/page';

const script = {
  id: 'attempt-1',
  status: 'submitted',
  candidate: { id: 'candidate-1', name: 'Hauwa Abdullahi', matricNumber: 'SYN-LAW-300-001', academicLevel: 300 },
  assessment: {
    title: 'Constitutional Law Examination',
    course: { code: 'LAW301', title: 'Criminal Law', semester: 'first' },
    items: [
      {
        questionId: 'question-1',
        maxMark: 10,
        question: {
          id: 'question-1',
          type: 'essay',
          text: 'Explain the doctrine of precedent.',
          markingSchemes: [{ method: 'human_grading', maxMark: 10 }],
        },
      },
      {
        questionId: 'question-2',
        maxMark: 10,
        question: {
          id: 'question-2',
          type: 'essay',
          text: 'Explain the separation of powers.',
          markingSchemes: [{ method: 'human_grading', maxMark: 10 }],
        },
      },
    ],
  },
  presentationMappings: [
    { id: 'mapping-1', questionId: 'question-1', displayPosition: 1 },
    { id: 'mapping-2', questionId: 'question-2', displayPosition: 2 },
  ],
  responses: [
    { questionId: 'question-1', currentText: 'Saved student answer from the examination submission.', wordCount: 8 },
    { questionId: 'question-2', currentText: 'Second saved examination response.', wordCount: 4 },
  ],
  objectiveOutcomes: [],
  gradeDecisions: [],
};

const recommendation = {
  suggested_score: 7,
  max_score: 10,
  strengths: ['Identifies the core principle'],
  weaknesses: [],
  criterion_observations: [],
  uncertainty_level: 'low',
  rationale: 'The saved response addresses the core principle.',
  validation: { passed: true, review_required: false, issues: [] },
};

describe('grading queue', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('filters by level and matric number, opens a saved response, and requests its AI recommendation', async () => {
    let completeAiResponse: (() => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/grading')) {
        return new Response(JSON.stringify([script]), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/attempts/attempt-1') {
        return new Response(JSON.stringify(script), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/ai/assess') {
        const stream = new ReadableStream({
          start(controller) {
            completeAiResponse = () => {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: 'completed', result: recommendation })}\n\n`));
              controller.close();
            };
          },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url === '/api/results/release' && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GradingPage />);
    await expect.element(page.getByText('Level 300 · SYN-LAW-300-001')).toBeVisible();
    await page.getByLabelText('Student level').selectOptions('300');
    await page.getByLabelText('Find by matric number').fill('300-001');
    await page.getByRole('button', { name: 'Search scripts' }).click();
    await expect.element(page.getByText('Hauwa Abdullahi — LAW301 · First semester')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/grading?level=300&matricNumber=300-001');

    await page.getByRole('button', { name: 'Access response' }).click();
    await expect.element(page.getByText('Saved student answer from the examination submission.')).toBeVisible();
    const recommendationButtons = page.getByRole('button', { name: 'Get AI Recommendation' });
    await expect.element(recommendationButtons.nth(1)).toBeVisible();
    await recommendationButtons.nth(0).click();
    await expect.element(page.getByTestId('ai-recommendation-spinner')).toBeVisible();
    await expect.element(page.getByTestId('ai-recommendation-idle-icon')).toBeVisible();
    completeAiResponse?.();
    await expect.element(page.getByText('The saved response addresses the core principle.')).toBeVisible();

    const aiRequest = fetchMock.mock.calls.find(([url]) => String(url) === '/api/ai/assess');
    expect(JSON.parse(String(aiRequest?.[1]?.body))).toMatchObject({
      attemptId: 'attempt-1',
      questionId: 'question-1',
      responseText: 'Saved student answer from the examination submission.',
      questionText: 'Explain the doctrine of precedent.',
    });
  });
});
