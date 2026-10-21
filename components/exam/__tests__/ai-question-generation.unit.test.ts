import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const database = {
    course: { findUnique: vi.fn(async () => ({ id: 'course-1', title: 'Constitutional Law', code: 'CONST101' })) },
    userCourse: { findMany: vi.fn(async () => [{ courseId: 'course-1' }]) },
    question: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `draft-${String(data.text).length}`, ...data })) },
    questionOption: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'option-1', ...data })) },
    answerKey: { create: vi.fn(async () => ({ id: 'answer-1' })) },
    markingScheme: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'scheme-1', ...data })) },
    aiRequest: { create: vi.fn(async () => ({ id: 'ai-request-1' })) },
  };
  return {
    prisma: {
      ...database,
      $transaction: vi.fn(async (callback: (tx: typeof database) => Promise<unknown>) => callback(database)),
    },
  };
});

vi.mock('@/lib/roles', () => ({
  requireRoleForAction: vi.fn(async () => ({
    error: null,
    session: { user: { id: 'lecturer-1', role: 'lecturer' } },
  })),
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: 'lecturer-1', role: 'lecturer' } },
  })),
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async () => ({ id: 'audit-1' })),
}));

import { POST as generateQuestions } from '@/app/api/ai/generate-questions/route';
import { prisma } from '@/lib/prisma';

function providerStream(payload: Record<string, unknown>): Response {
  const content = JSON.stringify(payload);
  return providerContentStream(content);
}

function providerContentStream(content: string, finishReason?: string): Response {
  const events = [`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`];
  if (finishReason) events.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}`);
  events.push('data: [DONE]', '', '');
  const body = events.join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

async function readResponse(response: Response): Promise<string> {
  return response.text();
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/ai/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validQuestion = {
  text: 'Explain the role of judicial review.',
  topic: 'Constitutional law',
  difficulty: 'medium',
  type: 'short_answer',
  markingScheme: {
    method: 'human_grading',
    maxMark: 10,
    rubric: [
      { criterion: 'Identifies the purpose of review', maxMark: 4 },
      { criterion: 'Explains its legal limits', maxMark: 6 },
    ],
  },
};

const validRequest = {
  courseId: 'course-1',
  topic: 'Judicial review',
  courseMaterial: 'Judicial review allows courts to review executive action.',
  markingRules: 'Award up to 10 marks for accurate explanation.',
  questionType: 'short_answer',
  count: 1,
  difficulty: 'medium',
};

describe('AI question generation workflow', () => {
  beforeEach(() => {
    vi.stubEnv('ABACUSAI_API_KEY', 'test-ai-provider-key');
    vi.stubGlobal('fetch', vi.fn(async () => providerStream({ questions: [validQuestion] })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('saves structurally valid questions with a balanced rubric as drafts', async () => {
    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(response.status).toBe(200);
    expect(output).toContain('"status":"completed"');
    expect(vi.mocked(prisma.question.create)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'draft', courseId: 'course-1' }),
    }));
    expect(vi.mocked(prisma.markingScheme.create)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ maxMark: 10 }),
    }));
  });

  it('generates subjective questions when lecturer marking rules are omitted', async () => {
    const requestWithoutMarkingRules = Object.fromEntries(
      Object.entries(validRequest).filter(([key]) => key !== 'markingRules'),
    );
    const response = await generateQuestions(request(requestWithoutMarkingRules));
    const output = await readResponse(response);
    const providerCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const providerBody = JSON.parse(String(providerCall?.[1]?.body)) as { messages: Array<{ content: string }> };

    expect(response.status).toBe(200);
    expect(output).toContain('"status":"completed"');
    expect(providerBody.messages[0].content).toContain('No lecturer-specific marking rules were supplied');
    expect(vi.mocked(prisma.markingScheme.create)).toHaveBeenCalled();
  });

  it('accepts 25 questions with course material above the previous limit and scales output tokens', async () => {
    const questions = Array.from({ length: 25 }, (_, index) => ({
      ...validQuestion,
      text: `Explain judicial review, part ${index + 1}.`,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => providerStream({ questions })));

    const response = await generateQuestions(request({
      ...validRequest,
      count: 25,
      courseMaterial: 'Synthetic course material. '.repeat(2_300),
    }));
    const output = await readResponse(response);
    const providerCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const providerBody = JSON.parse(String(providerCall?.[1]?.body)) as { max_tokens: number };

    expect(response.status).toBe(200);
    expect(output).toContain('"status":"completed"');
    expect(providerBody.max_tokens).toBe(25_000);
    expect(vi.mocked(prisma.question.create)).toHaveBeenCalledTimes(25);
  });

  it('rejects a question count above the configured maximum before calling the provider', async () => {
    const response = await generateQuestions(request({ ...validRequest, count: 51 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('between 1 and 50') });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not persist questions whose rubric marks do not add up to the maximum', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerStream({
      questions: [{
        ...validQuestion,
        markingScheme: {
          ...validQuestion.markingScheme,
          rubric: [{ criterion: 'Unbalanced', maxMark: 4 }],
        },
      }],
    })));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(response.status).toBe(200);
    expect(output).toContain('"status":"error"');
    expect(output).toContain('rubric totals');
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('reports malformed provider JSON separately and does not start persistence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerContentStream('{not-json')));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(output).toContain('The AI provider returned malformed JSON');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('reports a provider token-limit truncation with actionable guidance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerContentStream('{"questions":[', 'length')));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(output).toContain('The AI response was truncated');
    expect(output).toContain('shorten the course material');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a bare question array while retaining strict question validation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerContentStream(JSON.stringify([validQuestion]))));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(output).toContain('"status":"completed"');
    expect(prisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'draft', courseId: 'course-1' }),
    }));
  });

  it('accepts a single fenced JSON object from the provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerContentStream(`\`\`\`json\n${JSON.stringify({ questions: [validQuestion] })}\n\`\`\``)));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(output).toContain('"status":"completed"');
    expect(prisma.question.create).toHaveBeenCalled();
  });

  it('reports persistence failure without claiming that drafts were saved', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('synthetic database failure'));

    const response = await generateQuestions(request(validRequest));
    const output = await readResponse(response);

    expect(output).toContain('Generated questions could not be saved. No drafts were created');
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('rejects requests without lecturer-provided source material or marking rules before calling the provider', async () => {
    const response = await generateQuestions(request({ ...validRequest, courseMaterial: '', markingRules: '' }));

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('refuses to generate questions for courses the lecturer is not assigned to', async () => {
    vi.mocked(prisma.userCourse.findMany).mockResolvedValue([]);

    const response = await generateQuestions(request(validRequest));

    expect(response.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(prisma.question.create).not.toHaveBeenCalled();
  });
});
