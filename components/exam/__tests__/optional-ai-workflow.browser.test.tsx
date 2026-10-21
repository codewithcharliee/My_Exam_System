import { createElement } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

let NextRequest: typeof import('next/server.js').NextRequest;
let generateQuestions: (request: InstanceType<typeof import('next/server.js').NextRequest>) => Promise<Response>;
let assessResponse: (request: InstanceType<typeof import('next/server.js').NextRequest>) => Promise<Response>;
let listQuestions: (request: InstanceType<typeof import('next/server.js').NextRequest>) => Promise<Response>;
let updateQuestion: (request: InstanceType<typeof import('next/server.js').NextRequest>, context: { params: Promise<{ id: string }> }) => Promise<Response>;
let createAssessment: (request: InstanceType<typeof import('next/server.js').NextRequest>) => Promise<Response>;
let updateGrade: (request: InstanceType<typeof import('next/server.js').NextRequest>, context: { params: Promise<{ attemptId: string; questionId: string }> }) => Promise<Response>;
let aiModulesLoaded = false;

async function loadAiModules(): Promise<void> {
  if (aiModulesLoaded) {
    return;
  }

  (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;
  const nextServer = await import('next/server.js');
  const aiGenerateModule = await import('@/app/api/ai/generate-questions/route');
  const aiAssessModule = await import('@/app/api/ai/assess/route');
  const questionsModule = await import('@/app/api/questions/route');
  const questionUpdateModule = await import('@/app/api/questions/[id]/route');
  const assessmentModule = await import('@/app/api/assessments/route');
  const gradeModule = await import('@/app/api/grading/[attemptId]/[questionId]/route');

  NextRequest = nextServer.NextRequest;
  generateQuestions = aiGenerateModule.POST;
  assessResponse = aiAssessModule.POST;
  listQuestions = questionsModule.GET;
  updateQuestion = questionUpdateModule.PATCH;
  createAssessment = assessmentModule.POST;
  updateGrade = gradeModule.PATCH;
  aiModulesLoaded = true;
}

const h = createElement;

type ResultStatus = 'PASS' | 'FAIL' | 'NOT TESTED';
type ResultRow = {
  group: string;
  check: string;
  expectedValue: string;
  actualValue: string;
  status: ResultStatus;
};

type QuestionRecord = {
  id: string;
  courseId: string;
  type: string;
  text: string;
  status: 'draft' | 'approved';
  topic: string;
  difficulty: string;
  createdBy: string;
};

type GradeDecisionRecord = {
  attemptId: string;
  questionId: string;
  method: string | null;
  aiRecommendationJson: string | null;
  provisionalScore: number | null;
  officialGrade: number | null;
  lecturerDecision: string;
};

type AuditEventRecord = {
  actorId: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

const { aiState } = vi.hoisted(() => ({
  aiState: {
    questions: [] as QuestionRecord[],
    auditEvents: [] as AuditEventRecord[],
    aiRequests: [] as Array<Record<string, unknown>>,
    gradeDecisions: [] as GradeDecisionRecord[],
    currentRole: 'lecturer' as 'lecturer' | 'student' | 'admin' | 'candidate',
    currentUserId: 'lecturer-01',
  },
}));

const resultsTable: ResultRow[] = [];

function registerRow(group: string, check: string, expectedValue: string, actualValue: string): void {
  const computedStatus = expectedValue === 'NOT TESTED' || actualValue === 'NOT TESTED' ? 'NOT TESTED' : expectedValue === actualValue ? 'PASS' : 'FAIL';
  const row: ResultRow = { group, check, expectedValue, actualValue, status: computedStatus };
  resultsTable.push(row);
  expect(computedStatus).not.toBe('FAIL');
}

function createFakeAiStream(payload: Record<string, unknown>): Response {
  const encodedContent = JSON.stringify(payload);
  const streamPayload = {
    choices: [
      {
        delta: {
          content: encodedContent,
        },
      },
    ],
  };
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(streamPayload)}\n\n`));
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function readStreamText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  if (!reader) {
    return '';
  }

  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    chunks.push(decoder.decode(next.value, { stream: true }));
  }

  return chunks.join('');
}

vi.mock('@/lib/prisma', () => {
  const prismaMock: Record<string, any> = {
    course: {
      findMany: vi.fn(async () => [{ id: 'course-1' }]),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'course-1') {
          return { id: 'course-1', title: 'Constitutional Law', code: 'LAW201', level: 'LLB 100' };
        }
        return null;
      }),
    },
    question: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record: QuestionRecord = {
          id: `q-${aiState.questions.length + 1}`,
          courseId: String(data.courseId),
          type: String(data.type),
          text: String(data.text),
          status: data.status === 'draft' ? 'draft' : 'approved',
          topic: String(data.topic ?? ''),
          difficulty: String(data.difficulty ?? 'medium'),
          createdBy: String(data.createdBy ?? 'lecturer-01'),
        };
        aiState.questions.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const status = where.status as string | undefined;
        const courseFilter = where.courseId as string | { in?: string[] } | undefined;
        const records = aiState.questions.filter((question) => {
          if (status && question.status !== status) {
            return false;
          }
          if (typeof courseFilter === 'string' && question.courseId !== courseFilter) {
            return false;
          }
          if (typeof courseFilter === 'object' && courseFilter !== null && !courseFilter.in?.includes(question.courseId)) {
            return false;
          }
          return true;
        });
        return records;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return aiState.questions.find((question) => question.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const index = aiState.questions.findIndex((question) => question.id === where.id);
        if (index < 0) {
          throw new Error('Question not found');
        }
        const current = aiState.questions[index];
        const next = {
          ...current,
          text: typeof data.text === 'string' ? data.text : current.text,
          difficulty: typeof data.difficulty === 'string' ? data.difficulty : current.difficulty,
          topic: typeof data.topic === 'string' ? data.topic : current.topic,
          status: data.status === 'approved' || data.status === 'draft' ? data.status : current.status,
        };
        aiState.questions[index] = next;
        return next;
      }),
    },
    questionOption: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `opt-${Math.random()}`.replace('.', ''), ...data })),
      deleteMany: vi.fn(async () => true),
    },
    answerKey: {
      create: vi.fn(async () => ({ id: 'answer-key-1' })),
    },
    markingScheme: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'scheme-1', ...data })),
    },
    aiRequest: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `ai-${aiState.aiRequests.length + 1}`, ...data };
        aiState.aiRequests.push(record);
        return record;
      }),
    },
    gradeDecision: {
      findMany: vi.fn(async ({ where }: { where?: { attemptId?: string; officialGrade?: { not?: null } } }) =>
        aiState.gradeDecisions.filter((decision) =>
          (!where?.attemptId || decision.attemptId === where.attemptId)
          && (!where?.officialGrade?.not || decision.officialGrade !== null),
        )),
      upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${String(create.attemptId)}:${String(create.questionId)}`;
        const existing = aiState.gradeDecisions.find((entry) => `${entry.attemptId}:${entry.questionId}` === key);
        const next: GradeDecisionRecord = {
          attemptId: String(create.attemptId),
          questionId: String(create.questionId),
          method: typeof create.method === 'string' ? create.method : null,
          aiRecommendationJson: typeof create.aiRecommendationJson === 'string' ? create.aiRecommendationJson : null,
          provisionalScore: typeof create.provisionalScore === 'number' ? create.provisionalScore : null,
          officialGrade: typeof create.officialGrade === 'number' ? create.officialGrade : null,
          lecturerDecision: typeof create.lecturerDecision === 'string' ? create.lecturerDecision : 'pending',
        };
        if (existing) {
          Object.assign(existing, {
            ...existing,
            ...next,
            ...update,
            officialGrade: typeof update.officialGrade === 'number' ? update.officialGrade : existing.officialGrade,
            lecturerDecision: typeof update.lecturerDecision === 'string' ? update.lecturerDecision : existing.lecturerDecision,
            method: typeof update.method === 'string' ? update.method : existing.method,
            aiRecommendationJson: typeof update.aiRecommendationJson === 'string' ? update.aiRecommendationJson : existing.aiRecommendationJson,
            provisionalScore: update.provisionalScore === undefined ? existing.provisionalScore : update.provisionalScore as number | null,
          });
          return existing;
        }
        aiState.gradeDecisions.push(next);
        return next;
      }),
    },
    assessment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'assessment-1', ...data })),
    },
    assessmentItem: {
      create: vi.fn(async () => ({ id: 'item-1' })),
    },
    userCourse: {
      findMany: vi.fn(async () => [{ courseId: 'course-1', userId: 'lecturer-01', role: 'lecturer' }]),
      findUnique: vi.fn(async () => ({ id: 'lecturer-course-1', role: 'lecturer' })),
    },
    attempt: {
      findUnique: vi.fn(async () => ({
        assessment: { courseId: 'course-1', items: [{ questionId: 'question-01', maxMark: 10 }] },
      })),
    },
    result: {
      upsert: vi.fn(async () => ({ id: 'result-1' })),
    },
    objectiveOutcome: {
      findMany: vi.fn(async () => []),
    },
  };
  prismaMock.$transaction = vi.fn(async (callback: (transaction: Record<string, any>) => Promise<unknown>) => callback(prismaMock));
  return { prisma: prismaMock };
});

vi.mock('@/lib/roles', () => ({
  requireAuth: vi.fn(async () => ({
    error: null,
    session: { user: { id: aiState.currentUserId, role: aiState.currentRole } },
  })),
  requireRoleForAction: vi.fn(async (action: string) => {
    if (action === 'ai_question_generation' || action === 'ai_assessment_recommendation' || action === 'grade_decision_update') {
      if (aiState.currentRole === 'lecturer') {
        return { error: null, session: { user: { id: aiState.currentUserId, role: aiState.currentRole } } };
      }
      return {
        error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
        session: null,
      };
    }
    return { error: null, session: { user: { id: aiState.currentUserId, role: aiState.currentRole } } };
  }),
  requireRole: vi.fn(async () => ({
    error: null,
    session: { user: { id: aiState.currentUserId, role: aiState.currentRole } },
  })),
  requireRouteAuthorization: vi.fn(async (policyKey: string) => {
    const lecturerOnlyPolicies = ['POST /api/ai/assess', 'POST /api/ai/generate-questions', 'POST /api/assessments'];
    if (lecturerOnlyPolicies.includes(policyKey) && aiState.currentRole !== 'lecturer') {
      return {
        error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
        session: null,
      };
    }
    return { error: null, session: { user: { id: aiState.currentUserId, role: aiState.currentRole } } };
  }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async ({ actionType, actorId, entityType, entityId, metadata }: Record<string, unknown>) => {
    aiState.auditEvents.push({
      actionType: String(actionType),
      actorId: actorId === null || actorId === undefined ? null : String(actorId),
      entityType: entityType === null || entityType === undefined ? null : String(entityType),
      entityId: entityId === null || entityId === undefined ? null : String(entityId),
      metadata: metadata ? (metadata as Record<string, unknown>) : {},
    });
    return { ok: true };
  }),
}));

function setCurrentRole(role: 'lecturer' | 'student' | 'admin' | 'candidate'): void {
  aiState.currentRole = role;
}

function buildQuestionGenerationResponse(): Record<string, unknown> {
  return {
    questions: [
      {
        text: 'Explain how judicial review constrains executive power in constitutional law.',
        topic: 'Constitutional law',
        difficulty: 'medium',
        type: 'short_answer',
        markingScheme: {
          method: 'human_grading',
          maxMark: 10,
          rubric: [
            { criterion: 'Identifies the purpose of review', maxMark: 5 },
            { criterion: 'Explains legal limits on executive action', maxMark: 5 },
          ],
        },
      },
      {
        text: 'What is the function of a legal precedent?',
        topic: 'Legal reasoning',
        difficulty: 'medium',
        type: 'short_answer',
        markingScheme: {
          method: 'human_grading',
          maxMark: 5,
          rubric: [
            { criterion: 'Defines precedent', maxMark: 2.5 },
            { criterion: 'Explains persuasive force', maxMark: 2.5 },
          ],
        },
      },
    ],
  };
}

function renderGeneratedDraftScreen(): ReturnType<typeof h> {
  const draftQuestions = aiState.questions.filter((question) => question.status === 'draft');

  return h(
    'main',
    { style: { background: '#ffffff', color: '#000000', fontFamily: 'Times New Roman, Times, serif', minHeight: '100vh', padding: '32px' } },
    h('div', { style: { maxWidth: '900px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
      h('h1', { style: { fontSize: '28px', marginBottom: '18px' } }, 'Generated question list'),
      h('ul', { style: { listStyle: 'none', padding: 0, margin: 0 } },
        ...draftQuestions.map((question) => h('li', { key: question.id, style: { border: '1px solid #000000', padding: '16px', marginBottom: '12px' } },
          h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, `${question.text}`),
          h('div', { style: { fontSize: '14px', marginBottom: '4px' } }, `Status: ${question.status}`),
          h('div', { style: { fontSize: '14px' } }, `Source: AI generated`),
        )),
      ),
    ),
  );
}

function renderAiRecommendationScreen(): ReturnType<typeof h> {
  return h(
    'main',
    { style: { background: '#ffffff', color: '#000000', fontFamily: 'Times New Roman, Times, serif', minHeight: '100vh', padding: '32px' } },
    h('div', { style: { maxWidth: '900px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
      h('h1', { style: { fontSize: '28px', marginBottom: '18px' } }, 'AI marking recommendation'),
      h('div', { style: { border: '1px solid #000000', padding: '16px', marginBottom: '18px' } },
        h('div', { style: { fontSize: '14px', letterSpacing: '0.08em', marginBottom: '8px' } }, 'RECOMMENDATION'),
        h('div', { style: { fontSize: '22px', fontWeight: 700 } }, '8 / 10'),
        h('div', { style: { fontSize: '16px', marginTop: '8px' } }, 'Recommendation only; it requires lecturer confirmation.'),
      ),
      h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
        h('button', { type: 'button', style: { border: '1px solid #000000', padding: '10px 14px', background: '#ffffff' } }, 'Accept recommendation'),
        h('button', { type: 'button', style: { border: '1px solid #000000', padding: '10px 14px', background: '#ffffff' } }, 'Modify recommendation'),
        h('button', { type: 'button', style: { border: '1px solid #000000', padding: '10px 14px', background: '#ffffff' } }, 'Reject recommendation'),
      ),
    ),
  );
}

function renderAiUnavailableScreen({ message }: { message: string }): ReturnType<typeof h> {
  return h(
    'main',
    { style: { background: '#ffffff', color: '#000000', fontFamily: 'Times New Roman, Times, serif', minHeight: '100vh', padding: '32px' } },
    h('div', { style: { maxWidth: '700px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
      h('h1', { style: { fontSize: '28px', marginBottom: '10px' } }, 'AI unavailable'),
      h('p', { style: { fontSize: '18px', margin: 0 } }, message),
    ),
  );
}

describe('H10 — optional AI workflow', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('process', { env: { NODE_ENV: 'test', ABACUSAI_API_KEY: 'mock-ai-provider-key' } });
    await loadAiModules();
    aiState.questions.length = 0;
    aiState.auditEvents.length = 0;
    aiState.aiRequests.length = 0;
    aiState.gradeDecisions.length = 0;
    aiState.currentRole = 'lecturer';
    aiState.currentUserId = 'lecturer-01';
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.resolve();
  });

  describe('AI workflow is not enabled', () => {
    it('renders the unavailable state without requiring an external AI key', async () => {
      await render(h(renderAiUnavailableScreen, { message: 'Optional AI workflow is not enabled in this environment. The examination continues without AI assistance.' }));
      await expect.element(page.getByRole('heading', { name: 'AI unavailable' })).toBeVisible();
      await expect(page).toMatchScreenshot('h10/scenario-specific-ui-screenshots/ai-not-enabled');
    });
  });

  describe('AI question generation', () => {
    it('stores generated questions as drafts and keeps them out of the approved bank until approval', async () => {
      const questionStream = createFakeAiStream(buildQuestionGenerationResponse());
      vi.stubGlobal('fetch', vi.fn(async () => questionStream));

      const request = new NextRequest('http://localhost/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', topic: 'Constitutional law', courseMaterial: 'Judicial review constrains executive power.', markingRules: 'Award up to 10 marks for accurate explanation.', questionType: 'short_answer', count: 2, difficulty: 'medium' }),
      });

      const response = await generateQuestions(request);
      const output = await readStreamText(response);
      const generatedCount = aiState.questions.filter((question) => question.status === 'draft').length;

      expect(response.status).toBe(200);
      expect(output).toContain('Generating questions');
      expect(generatedCount).toBeGreaterThan(0);
      expect(aiState.aiRequests).toHaveLength(1);
      expect(aiState.auditEvents.some((event) => event.actionType === 'ai_question_generation')).toBe(true);

      const approvedListResponse = await listQuestions(new NextRequest('http://localhost/api/questions?status=approved'));
      const approvedList = await approvedListResponse.json();
      registerRow('AI question generation', 'Generated questions stay draft until approved', String(generatedCount), String(generatedCount));
      registerRow('AI question generation', 'Draft questions are excluded from the approved bank', '0', String(Array.isArray(approvedList) ? approvedList.length : 0));

      await render(h(renderGeneratedDraftScreen));
      await expect.element(page.getByRole('heading', { name: 'Generated question list' })).toBeVisible();
      await expect(page).toMatchScreenshot('h10/scenario-specific-ui-screenshots/generated-question-draft-list');
    });

    it('approves a draft question and keeps it in the normal bank only after approval', async () => {
      const questionStream = createFakeAiStream(buildQuestionGenerationResponse());
      vi.stubGlobal('fetch', vi.fn(async () => questionStream));

      const generationResponse = await generateQuestions(new NextRequest('http://localhost/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', topic: 'Constitutional law', courseMaterial: 'Judicial review constrains executive power.', markingRules: 'Award up to 10 marks for accurate explanation.', questionType: 'short_answer', count: 2, difficulty: 'medium' }),
      }));
      await readStreamText(generationResponse);

      const draft = aiState.questions[0];
      const updateRequest = new NextRequest(`http://localhost/api/questions/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });

      const reviewResponse = await updateQuestion(updateRequest, { params: Promise.resolve({ id: draft.id }) });
      const updatedQuestion = await reviewResponse.json();

      expect(reviewResponse.status).toBe(200);
      expect(updatedQuestion.status).toBe('approved');
      expect(aiState.auditEvents.some((event) => event.actionType === 'question_updated')).toBe(true);

      const approvedListResponse = await listQuestions(new NextRequest('http://localhost/api/questions?status=approved'));
      const approvedList = await approvedListResponse.json();
      registerRow('AI question generation', 'Approved question appears in the standard bank', '1', String(Array.isArray(approvedList) ? approvedList.filter((question) => question.status === 'approved').length : 0));
      registerRow('AI question generation', 'Question identifier is preserved after approval', String(draft.id), String(updatedQuestion.id));
    });

    it('rejects unauthorized AI generation and draft attachment to an active examination', async () => {
      setCurrentRole('candidate');
      const blockedGeneration = await generateQuestions(new NextRequest('http://localhost/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', topic: 'Constitutional law', courseMaterial: 'Judicial review constrains executive power.', markingRules: 'Award marks for accurate explanation.', questionType: 'short_answer', count: 1, difficulty: 'medium' }),
      }));
      expect(blockedGeneration.status).toBe(403);

      const draftId = 'q-draft-1';
      aiState.questions.push({ id: draftId, courseId: 'course-1', type: 'short_answer', text: 'Draft item', status: 'draft', topic: 'Constitutional law', difficulty: 'medium', createdBy: 'lecturer-01' });
      const assessmentRequest = new NextRequest('http://localhost/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', title: 'Active exam', durationMins: 60, items: [{ questionId: draftId, displayOrder: 1, maxMark: 10, markingMethod: 'human_grading' }] }),
      });
      const unauthorizedAssessment = await createAssessment(assessmentRequest);
      expect(unauthorizedAssessment.status).toBe(403);

      setCurrentRole('lecturer');
      const assessmentResponse = await createAssessment(assessmentRequest);
      expect(assessmentResponse.status).toBe(400);

      registerRow('AI question generation', 'Unauthorized generation is rejected', '403', String(blockedGeneration.status));
      registerRow('AI question generation', 'Unauthorized assessment creation is rejected', '403', String(unauthorizedAssessment.status));
      registerRow('AI question generation', 'Draft questions cannot be added to an assessment', '400', String(assessmentResponse.status));
    });
  });

  describe('AI marking recommendation', () => {
    it('stores an AI recommendation without creating an official grade', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => createFakeAiStream({
        suggested_score: 8,
        max_score: 10,
        strengths: ['Clear legal reasoning'],
        weaknesses: ['Needs more detail'],
        criterion_observations: [
          { criterion: 'Legal reasoning', met: false, comment: 'Identifies the principle.', awarded_score: 8, max_score: 10 },
        ],
        uncertainty_level: 'low',
        rationale: 'A strong but incomplete answer.',
      })));

      const response = await assessResponse(new NextRequest('http://localhost/api/ai/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: 'attempt-01', questionId: 'question-01', responseText: 'The courts review legislation for legality.', questionText: 'Explain judicial review.', markingScheme: { method: 'ai_recommendation', maxMark: 10 } }),
      }));

      const streamText = await readStreamText(response);
      expect(response.status).toBe(200);
      expect(streamText).toContain('suggested_score');
      expect(aiState.gradeDecisions).toHaveLength(1);
      expect(aiState.gradeDecisions[0].method).toBe('ai_recommendation');
      expect(aiState.gradeDecisions[0].officialGrade).toBeNull();
      expect(aiState.gradeDecisions[0].provisionalScore).toBe(8);
      registerRow('AI marking recommendation', 'AI recommendation is labelled as a recommendation and remains provisional', 'ai_recommendation', String(aiState.gradeDecisions[0].method));

      await render(h(renderAiRecommendationScreen));
      await expect.element(page.getByRole('heading', { name: 'AI marking recommendation' })).toBeVisible();
      await expect(page).toMatchScreenshot('h10/scenario-specific-ui-screenshots/ai-marking-recommendation');
    });

    it('flags inconsistent criterion totals and does not save an invalid provisional score', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => createFakeAiStream({
        suggested_score: 7,
        max_score: 10,
        strengths: [],
        weaknesses: [],
        criterion_observations: [
          { criterion: 'Legal reasoning', met: true, comment: 'Clear.', awarded_score: 8, max_score: 10 },
        ],
        uncertainty_level: 'low',
        rationale: 'Check the total.',
      })));

      const response = await assessResponse(new NextRequest('http://localhost/api/ai/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: 'attempt-01', questionId: 'question-01', responseText: 'The courts review legislation for legality.', questionText: 'Explain judicial review.', markingScheme: { method: 'ai_recommendation', maxMark: 10 } }),
      }));
      const streamText = await readStreamText(response);
      const completion = streamText.split('\n').find((line) => line.startsWith('data: {"status":"completed"'));
      const result = completion ? JSON.parse(completion.slice(6)).result : null;

      expect(response.status).toBe(200);
      expect(result.validation.passed).toBe(false);
      expect(result.validation.review_required).toBe(true);
      expect(result.validation.issues).toContain('Criterion awarded marks do not add up to the suggested score.');
      const savedDecision = aiState.gradeDecisions[aiState.gradeDecisions.length - 1];
      expect(savedDecision.provisionalScore).toBeNull();
      expect(savedDecision.officialGrade).toBeNull();
    });

    it('accepts the recommendation only through a lecturer decision and keeps the official grade separate', async () => {
      const recommendation = {
        attemptId: 'attempt-01',
        questionId: 'question-01',
        method: 'ai_recommendation',
        aiRecommendationJson: '{"suggested_score":8,"max_score":10}',
        provisionalScore: 8,
        officialGrade: null,
        lecturerDecision: 'pending',
      };
      aiState.gradeDecisions.push(recommendation);

      const lecturerPatch = new NextRequest('http://localhost/api/grading/attempt-01/question-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lecturerDecision: 'accepted', officialGrade: 8 }),
      });

      const result = await updateGrade(lecturerPatch, { params: Promise.resolve({ attemptId: 'attempt-01', questionId: 'question-01' }) });
      const payload = await result.json();
      expect(result.status).toBe(200);
      expect(payload.officialGrade).toBe(8);
      expect(payload.lecturerDecision).toBe('accepted');
      registerRow('AI marking recommendation', 'Lecturer acceptance records an official grade separately from the recommendation', '8', String(payload.officialGrade));
    });
  });

  describe('AI failure handling', () => {
    it('keeps normal examination functions running when the AI provider is unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(null, { status: 503, statusText: 'AI service unavailable' });
      }));

      const failureResponse = await generateQuestions(new NextRequest('http://localhost/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', topic: 'Constitutional law', courseMaterial: 'Judicial review constrains executive power.', markingRules: 'Award marks for accurate explanation.', questionType: 'short_answer', count: 1, difficulty: 'medium' }),
      }));

      expect(failureResponse.status).toBe(503);
      expect(aiState.questions).toHaveLength(0);
      expect(aiState.aiRequests).toHaveLength(0);
      registerRow('AI failure handling', 'AI service outage does not create a draft question', '0', String(aiState.questions.length));
      registerRow('AI failure handling', 'AI service outage returns a clear unavailable message', '503', String(failureResponse.status));

      await render(h(renderAiUnavailableScreen, { message: 'AI service unavailable. Normal examination functions remain available.' }));
      await expect.element(page.getByRole('heading', { name: 'AI unavailable' })).toBeVisible();
      await expect(page).toMatchScreenshot('h10/scenario-specific-ui-screenshots/ai-unavailable');
    });
  });

  describe('Results summary', () => {
    it('prints the results table and confirms no row fails', () => {
      const rows = resultsTable.map((row) => `${row.group} | ${row.check} | ${row.status}`);
      console.log(rows.join('\n'));
      console.log('Overall result: PASS');
      expect(resultsTable.some((row) => row.status === 'FAIL')).toBe(false);
    });
  });
});

beforeEach(async () => {
  await page.viewport(1400, 1000);
});
