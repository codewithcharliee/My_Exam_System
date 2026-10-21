import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { authState, aiState } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string; email: string; name: string; role: string } },
  aiState: { response: '', unavailable: false },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => ({ user: authState.user })),
}));

vi.mock('@/lib/ai/provider', () => {
  class AiProviderUnavailableError extends Error {}
  return {
    AiProviderUnavailableError,
    callAiProvider: vi.fn(async () => {
      if (aiState.unavailable) throw new AiProviderUnavailableError('Provider is unavailable');
      const upstream = JSON.stringify({
        choices: [{ delta: { content: aiState.response } }],
      });
      return new Response(`data: ${upstream}\n\ndata: [DONE]\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }),
  };
});

import { POST as createAssessment } from '@/app/api/assessments/route';
import { GET as getAssessmentById, PATCH as updateAssessment } from '@/app/api/assessments/[id]/route';
import { POST as createQuestion } from '@/app/api/questions/route';
import { POST as startAttempt } from '@/app/api/attempts/start/route';
import { GET as getAttempt } from '@/app/api/attempts/[id]/route';
import { POST as syncResponses } from '@/app/api/attempts/[id]/sync/route';
import { POST as submitAttempt } from '@/app/api/attempts/[id]/submit/route';
import { PATCH as saveGrade } from '@/app/api/grading/[attemptId]/[questionId]/route';
import { GET as getGradingQueue } from '@/app/api/grading/route';
import { POST as releaseResult } from '@/app/api/results/release/route';
import { GET as getResults } from '@/app/api/results/route';
import { POST as submitReadiness } from '@/app/api/readiness/route';
import { POST as generateQuestions } from '@/app/api/ai/generate-questions/route';
import { POST as assessResponse } from '@/app/api/ai/assess/route';
import {
  GET as getMonitoringEvents,
  PATCH as reviewMonitoringEvent,
  POST as createMonitoringEvent,
} from '@/app/api/monitoring/events/route';
import { POST as resetAttempt } from '@/app/api/admin/reset-attempt/route';
import { GET as verifyAudit } from '@/app/api/audit/verify/route';
import { authorizeCredentials } from '@/lib/credential-auth';
import { createSessionToken, hashSessionToken } from '@/lib/session-integrity';
import { prisma } from '@/lib/prisma';

const databaseUrl = process.env.TEST_DATABASE_URL;
const safeDatabase = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
        && /^\/bingham_exam_tests_[a-f0-9]+$/i.test(url.pathname);
    })()
  : false;

if (databaseUrl && !safeDatabase) {
  throw new Error('Integration workflows only run against the temporary loopback bingham_exam_tests_* database.');
}

const databaseDescribe = safeDatabase ? describe : describe.skip;
const suffix = randomUUID();
const performanceCandidateIds = Array.from({ length: 25 }, (_, index) =>
  `it-perf-candidate-${index + 1}-${suffix}`,
);
const ids = {
  lecturer: `it-lecturer-${suffix}`,
  admin: `it-admin-${suffix}`,
  examOfficer: `it-exam-officer-${suffix}`,
  invigilator: `it-invigilator-${suffix}`,
  candidate: `it-candidate-${suffix}`,
  candidateTwo: `it-candidate-two-${suffix}`,
  candidateUnready: `it-candidate-unready-${suffix}`,
  eligibilityCandidate: `it-eligibility-candidate-${suffix}`,
  randomCandidateOne: `it-random-candidate-one-${suffix}`,
  randomCandidateTwo: `it-random-candidate-two-${suffix}`,
  course: `it-course-${suffix}`,
  multipleChoiceOne: `it-mcq-one-${suffix}`,
  multipleChoiceTwo: `it-mcq-two-${suffix}`,
  multipleChoiceThree: `it-mcq-three-${suffix}`,
  essay: `it-essay-${suffix}`,
  shortAnswerExact: `it-short-exact-${suffix}`,
  shortAnswerEquivalent: `it-short-equivalent-${suffix}`,
  shortAnswerTypo: `it-short-typo-${suffix}`,
  shortAnswerAmbiguous: `it-short-ambiguous-${suffix}`,
  legalProblem: `it-legal-problem-${suffix}`,
  caseAnalysis: `it-case-analysis-${suffix}`,
  draft: `it-draft-${suffix}`,
  foreign: `it-foreign-${suffix}`,
  published: `it-published-${suffix}`,
  randomized: `it-randomized-${suffix}`,
  subjective: `it-subjective-${suffix}`,
  future: `it-future-${suffix}`,
  draftAssessment: `it-draft-assessment-${suffix}`,
  maxAttempt: `it-max-attempt-${suffix}`,
};

type SessionUser = NonNullable<typeof authState.user>;
type AssessmentSpec = {
  title: string;
  status?: 'draft' | 'published';
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  maxAttempts?: number;
  startAt?: Date | null;
  endAt?: Date | null;
  questionIds: string[];
  maxMark?: number;
};

function setUser(user: SessionUser | null) {
  authState.user = user;
}

function identity(id: string, role: string): SessionUser {
  const name = role === 'candidate' ? 'Integration Candidate' : `Integration ${role}`;
  return { id, role, name, email: `${id}@example.test` };
}

function apiRequest(
  url: string,
  method: string,
  body?: unknown,
  cookie?: { attemptId: string; token: string },
) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', `exam_session_${cookie.attemptId}=${cookie.token}`);
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function routeParams<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

async function makeAssessment(spec: AssessmentSpec) {
  return prisma.assessment.create({
    data: {
      id: `it-assessment-${randomUUID()}`,
      courseId: ids.course,
      title: spec.title,
      durationMins: 45,
      status: spec.status ?? 'published',
      randomizeQuestions: spec.randomizeQuestions ?? false,
      randomizeOptions: spec.randomizeOptions ?? false,
      maxAttempts: spec.maxAttempts ?? 2,
      startAt: spec.startAt ?? new Date(Date.now() - 60_000),
      endAt: spec.endAt ?? new Date(Date.now() + 3_600_000),
      createdBy: ids.lecturer,
      items: {
        create: spec.questionIds.map((questionId, index) => ({
          questionId,
          displayOrder: index + 1,
          maxMark: spec.maxMark ?? 5,
        })),
      },
    },
  });
}

async function makeDirectAttempt(
  candidateId: string,
  assessmentId: string,
  status: 'in_progress' | 'submitted' = 'in_progress',
) {
  const token = createSessionToken();
  const attempt = await prisma.attempt.create({
    data: {
      candidateId,
      assessmentId,
      startAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      status,
      isActive: status === 'in_progress',
      submittedAt: status === 'submitted' ? new Date() : null,
      sessions: {
        create: {
          sessionTokenHash: hashSessionToken(token),
          userAgent: 'integration-test',
        },
      },
    },
  });
  const assessmentItems = await prisma.assessmentItem.findMany({
    where: { assessmentId },
    orderBy: { displayOrder: 'asc' },
  });
  await prisma.response.createMany({
    data: assessmentItems.map((item) => ({
      attemptId: attempt.id,
      questionId: item.questionId,
      syncStatus: 'synced',
    })),
  });
  return { attempt, token };
}

function responsePayload(questionId: string, selectedOptionId: string | null, currentText: string | null = null) {
  return {
    questionId,
    selectedOptionId,
    currentText,
    wordCount: currentText ? currentText.trim().split(/\s+/).length : 0,
    timeSpentSecs: 19,
    visitCount: 1,
    answerChanges: 1,
  };
}

databaseDescribe('Integration tests — production handlers with isolated PostgreSQL persistence', () => {
  let objectiveAssessmentId = '';
  let randomAssessmentId = '';
  let subjectiveAssessmentId = '';
  let shortAnswerAssessmentId = '';
  let futureAssessmentId = '';
  let expiredAssessmentId = '';
  let draftAssessmentId = '';
  let maxAttemptAssessmentId = '';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('integration-password', 4);
    await prisma.user.createMany({
      data: [
        { id: ids.lecturer, name: 'Integration Lecturer', email: `${ids.lecturer}@example.test`, passwordHash, role: 'lecturer' },
        { id: ids.admin, name: 'Integration Administrator', email: `${ids.admin}@example.test`, passwordHash, role: 'admin' },
        { id: ids.examOfficer, name: 'Integration Exam Officer', email: `${ids.examOfficer}@example.test`, passwordHash, role: 'exam_officer' },
        { id: ids.invigilator, name: 'Integration Invigilator', email: `${ids.invigilator}@example.test`, passwordHash, role: 'invigilator' },
        { id: ids.candidate, name: 'Integration Candidate', email: `${ids.candidate}@example.test`, passwordHash, role: 'candidate' },
        { id: ids.candidateTwo, name: 'Integration Candidate Two', email: `${ids.candidateTwo}@example.test`, passwordHash, role: 'candidate' },
        { id: ids.candidateUnready, name: 'Integration Candidate Unready', email: `${ids.candidateUnready}@example.test`, passwordHash, role: 'candidate' },
        { id: ids.eligibilityCandidate, name: 'Integration Enrolled Candidate', email: `${ids.eligibilityCandidate}@example.test`, passwordHash, role: 'candidate' },
        { id: ids.randomCandidateOne, name: 'Integration Random Candidate One', email: `${ids.randomCandidateOne}@example.test`, passwordHash, role: 'candidate' },
        { id: ids.randomCandidateTwo, name: 'Integration Random Candidate Two', email: `${ids.randomCandidateTwo}@example.test`, passwordHash, role: 'candidate' },
        ...performanceCandidateIds.map((id, index) => ({
          id,
          name: `Performance Candidate ${index + 1}`,
          email: `${id}@example.test`,
          passwordHash,
          role: 'candidate',
        })),
      ],
    });
    await prisma.course.create({
      data: { id: ids.course, code: `IT-${suffix}`, title: 'Integration Examination Course' },
    });
    await prisma.userCourse.createMany({
      data: [
        { userId: ids.lecturer, courseId: ids.course, role: 'lecturer' },
        { userId: ids.candidate, courseId: ids.course, role: 'candidate' },
        { userId: ids.candidateTwo, courseId: ids.course, role: 'candidate' },
        { userId: ids.eligibilityCandidate, courseId: ids.course, role: 'candidate' },
        { userId: ids.randomCandidateOne, courseId: ids.course, role: 'candidate' },
        { userId: ids.randomCandidateTwo, courseId: ids.course, role: 'candidate' },
        ...performanceCandidateIds.map((userId) => ({
          userId,
          courseId: ids.course,
          role: 'candidate',
        })),
      ],
    });
    const mcqOneOptions = await prisma.question.create({
      data: {
        id: ids.multipleChoiceOne,
        courseId: ids.course,
        type: 'multiple_choice',
        text: 'Which option is the correct integration-test answer?',
        createdBy: ids.lecturer,
        options: {
          create: [
            { id: `it-correct-${suffix}`, text: 'Correct', isCorrect: true, sortOrder: 0 },
            { id: `it-wrong-one-${suffix}`, text: 'Incorrect A', sortOrder: 1 },
            { id: `it-wrong-two-${suffix}`, text: 'Incorrect B', sortOrder: 2 },
            { id: `it-wrong-three-${suffix}`, text: 'Incorrect C', sortOrder: 3 },
          ],
        },
      },
    });
    const answerOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: mcqOneOptions.id, isCorrect: true },
    });
    await prisma.answerKey.create({
      data: { questionId: ids.multipleChoiceOne, correctOptionId: answerOption.id },
    });
    const secondQuestion = await prisma.question.create({
      data: {
        id: ids.multipleChoiceTwo,
        courseId: ids.course,
        type: 'multiple_choice',
        text: 'Which response should score zero?',
        createdBy: ids.lecturer,
        options: {
          create: [
            { id: `it-correct-two-${suffix}`, text: 'Correct', isCorrect: true, sortOrder: 0 },
            { id: `it-wrong-four-${suffix}`, text: 'Incorrect', sortOrder: 1 },
          ],
        },
      },
    });
    const secondCorrectOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: secondQuestion.id, isCorrect: true },
    });
    await prisma.answerKey.create({
      data: { questionId: ids.multipleChoiceTwo, correctOptionId: secondCorrectOption.id },
    });
    const thirdQuestion = await prisma.question.create({
      data: {
        id: ids.multipleChoiceThree,
        courseId: ids.course,
        type: 'multiple_choice',
        text: 'Which option is deliberately left unanswered?',
        createdBy: ids.lecturer,
        options: {
          create: [
            { id: `it-correct-three-${suffix}`, text: 'Correct', isCorrect: true, sortOrder: 0 },
            { id: `it-wrong-five-${suffix}`, text: 'Incorrect', sortOrder: 1 },
          ],
        },
      },
    });
    const thirdCorrectOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionId: thirdQuestion.id, isCorrect: true },
    });
    await prisma.answerKey.create({
      data: { questionId: thirdQuestion.id, correctOptionId: thirdCorrectOption.id },
    });
    await prisma.question.createMany({
      data: [
        { id: ids.essay, courseId: ids.course, type: 'essay', text: 'Explain the tested principle.', createdBy: ids.lecturer },
        { id: ids.shortAnswerExact, courseId: ids.course, type: 'short_answer', text: 'State the separation-of-powers principle.', createdBy: ids.lecturer },
        { id: ids.shortAnswerEquivalent, courseId: ids.course, type: 'short_answer', text: 'State an accepted equivalent legal formulation.', createdBy: ids.lecturer },
        { id: ids.shortAnswerTypo, courseId: ids.course, type: 'short_answer', text: 'Name the doctrine using its configured phrase.', createdBy: ids.lecturer },
        { id: ids.shortAnswerAmbiguous, courseId: ids.course, type: 'short_answer', text: 'Analyze this fact-sensitive issue.', createdBy: ids.lecturer },
        { id: ids.legalProblem, courseId: ids.course, type: 'legal_problem', text: 'Apply the legal rule to the synthetic facts.', createdBy: ids.lecturer },
        { id: ids.caseAnalysis, courseId: ids.course, type: 'case_analysis', text: 'Analyze the synthetic case.', createdBy: ids.lecturer },
        { id: ids.draft, courseId: ids.course, type: 'short_answer', status: 'draft', text: 'Draft question', createdBy: ids.lecturer },
        { id: ids.foreign, courseId: ids.course, type: 'short_answer', text: 'Question outside this assessment', createdBy: ids.lecturer },
      ],
    });
    for (const scheme of [
      { questionId: ids.shortAnswerExact, method: 'exact_match' as const, configJson: JSON.stringify({ acceptedPhrases: ['separation of powers'] }) },
      { questionId: ids.shortAnswerEquivalent, method: 'acceptable_answer' as const, configJson: JSON.stringify({ acceptableAnswers: ['division of governmental powers'] }) },
      { questionId: ids.shortAnswerTypo, method: 'exact_match' as const, configJson: JSON.stringify({ acceptedPhrases: ['stare decisis'], spellingTolerance: 1 }) },
      { questionId: ids.shortAnswerAmbiguous, method: 'human_grading' as const, configJson: null },
    ]) {
      await prisma.markingScheme.create({
        data: { ...scheme, maxMark: 5 },
      });
    }
    await prisma.markingScheme.create({
      data: {
        questionId: ids.essay,
        method: 'ai_recommendation',
        maxMark: 10,
        configJson: JSON.stringify({ rubric: [{ criterion: 'Knowledge' }, { criterion: 'Analysis' }] }),
      },
    });
    const objective = await makeAssessment({
      title: 'Objective scoring and submission',
      questionIds: [ids.multipleChoiceOne, ids.multipleChoiceTwo, ids.multipleChoiceThree],
      maxMark: 2,
      maxAttempts: 1,
    });
    objectiveAssessmentId = objective.id;
    const randomized = await makeAssessment({
      title: 'Randomized exam',
      questionIds: [ids.multipleChoiceOne, ids.multipleChoiceTwo, ids.essay],
      randomizeQuestions: true,
      randomizeOptions: true,
    });
    randomAssessmentId = randomized.id;
    const subjective = await makeAssessment({
      title: 'Subjective grading and result release',
      questionIds: [ids.essay],
      maxMark: 10,
    });
    subjectiveAssessmentId = subjective.id;
    const shortAnswer = await makeAssessment({
      title: 'Short-answer marking decisions',
      questionIds: [ids.shortAnswerExact, ids.shortAnswerEquivalent, ids.shortAnswerTypo, ids.shortAnswerAmbiguous],
      maxMark: 5,
    });
    shortAnswerAssessmentId = shortAnswer.id;
    const future = await makeAssessment({
      title: 'Future exam',
      questionIds: [ids.multipleChoiceOne],
      startAt: new Date(Date.now() + 3_600_000),
    });
    futureAssessmentId = future.id;
    const expired = await makeAssessment({
      title: 'Expired exam',
      questionIds: [ids.multipleChoiceOne],
      endAt: new Date(Date.now() - 60_000),
    });
    expiredAssessmentId = expired.id;
    const draft = await makeAssessment({
      title: 'Unpublished exam',
      questionIds: [ids.multipleChoiceOne],
      status: 'draft',
    });
    draftAssessmentId = draft.id;
    const maxed = await makeAssessment({
      title: 'Single-attempt exam',
      questionIds: [ids.multipleChoiceOne],
      maxAttempts: 1,
    });
    maxAttemptAssessmentId = maxed.id;

    await prisma.readinessCheck.createMany({
      data: [{
        candidateId: ids.candidate,
        checkType: 'readiness_summary',
        status: 'passed',
        detailsJson: JSON.stringify({ failedCount: 0, blocked: false }),
      }, ...[ids.eligibilityCandidate, ids.randomCandidateOne, ids.randomCandidateTwo].map((candidateId) => ({
        candidateId,
        checkType: 'readiness_summary',
        status: 'passed',
        detailsJson: JSON.stringify({ failedCount: 0, blocked: false }),
      }))],
    });
  });

  afterAll(async () => {
    setUser(null);
    aiState.unavailable = false;
    await prisma.$disconnect();
  });

  it('IT-01 authenticates real credentials and rejects role/portal misuse at route boundaries', async () => {
    const authenticated = await authorizeCredentials({
      email: `${ids.lecturer}@example.test`,
      password: 'integration-password',
      portal: 'lecturer',
    });
    expect(authenticated?.id).toBe(ids.lecturer);
    expect(await authorizeCredentials({
      email: `${ids.lecturer}@example.test`,
      password: 'wrong-password',
      portal: 'lecturer',
    })).toBeNull();

    for (const role of ['candidate', 'lecturer', 'invigilator', 'exam_officer', 'admin']) {
      const roleUser = await authorizeCredentials({
        email: `${ids[role === 'exam_officer' ? 'examOfficer' : role]}@example.test`,
        password: 'integration-password',
        portal: role,
      });
      expect(roleUser?.role).toBe(role);
    }
    expect(await authorizeCredentials({
      email: `${ids.lecturer}@example.test`,
      password: 'integration-password',
      portal: 'candidate',
    })).toBeNull();

    setUser(identity(ids.candidate, 'candidate'));
    const forbidden = await createAssessment(apiRequest('/api/assessments', 'POST', {
      courseId: ids.course,
      title: 'Candidate-created assessment',
      durationMins: 30,
    }));
    expect(forbidden.status).toBe(403);
    expect(await prisma.assessment.count({ where: { title: 'Candidate-created assessment' } })).toBe(0);
  });

  it('IT-03 creates validated question-bank entries and enforces lecturer authorization', async () => {
    setUser(identity(ids.candidate, 'candidate'));
    const denied = await createQuestion(
      apiRequest('/api/questions', 'POST', { courseId: ids.course, type: 'essay', text: 'Unauthorized question' }),
    );
    expect(denied.status).toBe(403);

    setUser(identity(ids.lecturer, 'lecturer'));
    const invalid = await createQuestion(
      apiRequest('/api/questions', 'POST', {
        courseId: ids.course,
        type: 'multiple_choice',
        text: 'Invalid question with no correct answer',
        options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }],
      }),
    );
    expect(invalid.status).toBe(400);

    const created = await createQuestion(
      apiRequest('/api/questions', 'POST', {
        courseId: ids.course,
        type: 'multiple_choice',
        text: 'Created through production question handler',
        topic: 'Integration testing',
        options: [
          { text: 'Correct answer', isCorrect: true },
          { text: 'Distractor one', isCorrect: false },
          { text: 'Distractor two', isCorrect: false },
        ],
      }),
    );
    expect(created.status).toBe(201);
    const question = await responseJson(created);
    expect(await prisma.questionOption.count({ where: { questionId: String(question.id) } })).toBe(3);
    expect(await prisma.answerKey.count({ where: { questionId: String(question.id) } })).toBe(1);
  });

  it('IT-03 creates assessments only with approved questions and persists assessment-item links', async () => {
    setUser(identity(ids.lecturer, 'lecturer'));
    const before = await prisma.assessment.count();
    const invalid = await createAssessment(apiRequest('/api/assessments', 'POST', {
      courseId: ids.course,
      title: `Reject draft question ${suffix}`,
      durationMins: 30,
      items: [{ questionId: ids.draft, displayOrder: 1, maxMark: 5 }],
    }));
    expect(invalid.status).toBe(400);
    expect(await prisma.assessment.count()).toBe(before);

    const created = await createAssessment(apiRequest('/api/assessments', 'POST', {
      courseId: ids.course,
      title: `Created assessment ${suffix}`,
      durationMins: 30,
      maxAttempts: 2,
      items: [
        { questionId: ids.multipleChoiceOne, displayOrder: 1, maxMark: 4 },
        { questionId: ids.shortAnswerExact, displayOrder: 2, maxMark: 5 },
        { questionId: ids.essay, displayOrder: 3, maxMark: 10 },
        { questionId: ids.legalProblem, displayOrder: 4, maxMark: 15 },
        { questionId: ids.caseAnalysis, displayOrder: 5, maxMark: 15 },
      ],
    }));
    expect(created.status).toBe(201);
    const assessment = await responseJson(created);
    const assessmentItems = await prisma.assessmentItem.findMany({
      where: { assessmentId: String(assessment.id) },
      orderBy: { displayOrder: 'asc' },
    });
    expect(assessmentItems).toMatchObject([
      { questionId: ids.multipleChoiceOne, displayOrder: 1, maxMark: 4 },
      { questionId: ids.shortAnswerExact, displayOrder: 2, maxMark: 5 },
      { questionId: ids.essay, displayOrder: 3, maxMark: 10 },
      { questionId: ids.legalProblem, displayOrder: 4, maxMark: 15 },
      { questionId: ids.caseAnalysis, displayOrder: 5, maxMark: 15 },
    ]);

    const assessmentId = String(assessment.id);
    setUser(identity(ids.eligibilityCandidate, 'candidate'));
    const hiddenDraft = await getAssessmentById(
      apiRequest(`/api/assessments/${assessmentId}`, 'GET'),
      routeParams({ id: assessmentId }),
    );
    expect(hiddenDraft.status).toBe(404);

    setUser(identity(ids.lecturer, 'lecturer'));
    const published = await updateAssessment(
      apiRequest(`/api/assessments/${assessmentId}`, 'PATCH', { status: 'published' }),
      routeParams({ id: assessmentId }),
    );
    expect(published.status).toBe(200);
    setUser(identity(ids.eligibilityCandidate, 'candidate'));
    const candidateAssessment = await getAssessmentById(
      apiRequest(`/api/assessments/${assessmentId}`, 'GET'),
      routeParams({ id: assessmentId }),
    );
    expect(candidateAssessment.status).toBe(200);
    const candidatePayload = await responseJson(candidateAssessment);
    expect(candidatePayload.items).toMatchObject([
      { questionId: ids.multipleChoiceOne, maxMark: 4 },
      { questionId: ids.shortAnswerExact, maxMark: 5 },
      { questionId: ids.essay, maxMark: 10 },
      { questionId: ids.legalProblem, maxMark: 15 },
      { questionId: ids.caseAnalysis, maxMark: 15 },
    ]);
    const candidatePayloadText = JSON.stringify(candidatePayload);
    expect(candidatePayloadText).not.toContain('isCorrect');
    expect(candidatePayloadText).not.toContain('answerKeys');
    expect(candidatePayloadText).not.toContain('markingSchemes');

    setUser(identity(ids.candidateUnready, 'candidate'));
    const unenrolled = await getAssessmentById(
      apiRequest(`/api/assessments/${assessmentId}`, 'GET'),
      routeParams({ id: assessmentId }),
    );
    expect(unenrolled.status).toBe(404);

  setUser(identity(ids.lecturer, 'lecturer'));
    const beforeDuplicate = await prisma.assessment.count();
    const duplicate = await createAssessment(apiRequest('/api/assessments', 'POST', {
      courseId: ids.course,
      title: `Duplicate question link ${suffix}`,
      durationMins: 30,
      items: [
        { questionId: ids.multipleChoiceOne, displayOrder: 1, maxMark: 4 },
        { questionId: ids.multipleChoiceOne, displayOrder: 2, maxMark: 4 },
      ],
    }));
    expect(duplicate.status).toBe(400);
    expect(await prisma.assessment.count()).toBe(beforeDuplicate);
  });

  it('IT-02 enforces course enrollment before assessment access', async () => {
    setUser(identity(ids.candidateUnready, 'candidate'));
    const attemptsBeforeIneligibleStart = await prisma.attempt.count({ where: { candidateId: ids.candidateUnready } });
    const notEnrolled = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: objectiveAssessmentId }));
    expect(notEnrolled.status).toBe(403);
    expect(await prisma.attempt.count({ where: { candidateId: ids.candidateUnready } })).toBe(attemptsBeforeIneligibleStart);

    setUser(identity(ids.candidateTwo, 'candidate'));
    const notReady = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: futureAssessmentId }));
    expect(notReady.status).toBe(400);
    const readinessChecks = [
      'JavaScript',
      'IndexedDB',
      'Web Crypto API',
      'Network',
      'Camera',
      'Fullscreen',
      'Local Storage Write',
      'Autosave Simulation',
      'Sync Endpoint Reachability',
      'Submission Endpoint Reachability',
    ].map((checkType) => ({ checkType, status: 'pass', details: { source: 'integration-test' } }));
    const readiness = await submitReadiness(apiRequest('/api/readiness', 'POST', { checks: readinessChecks }));
    expect(readiness.status).toBe(200);
    expect((await responseJson(readiness)).summary).toMatchObject({ failedCount: 0, blocked: false });
    const unpublished = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: draftAssessmentId }));
    expect(unpublished.status).toBe(400);
    const notStarted = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: futureAssessmentId }));
    expect(notStarted.status).toBe(400);
    await prisma.attempt.create({
      data: { candidateId: ids.candidateTwo, assessmentId: maxAttemptAssessmentId, status: 'submitted', isActive: false },
    });
    const maxed = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: maxAttemptAssessmentId }));
    expect(maxed.status).toBe(400);

    setUser(identity(ids.candidate, 'candidate'));
    const started = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: objectiveAssessmentId }));
    expect(started.status).toBe(201);
    const { attemptId } = await responseJson(started) as { attemptId: string };
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).toMatchObject({
      candidateId: ids.candidate,
      assessmentId: objectiveAssessmentId,
      status: 'in_progress',
      isActive: true,
    });
  });

  it('IT-04 starts attempts inside the published window with duration-based expiry', async () => {
    setUser(identity(ids.eligibilityCandidate, 'candidate'));
    const afterWindow = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: expiredAssessmentId }));
    expect(afterWindow.status).toBe(400);
    expect(await prisma.attempt.count({ where: { candidateId: ids.eligibilityCandidate, assessmentId: expiredAssessmentId } })).toBe(0);

    const startedAt = Date.now();
    const started = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: objectiveAssessmentId }));
    expect(started.status).toBe(201);
    const { attemptId, expiresAt: responseExpiry } = await responseJson(started) as { attemptId: string; expiresAt: string };
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.startAt?.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(attempt.startAt?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(attempt.expiresAt?.getTime()).toBe(attempt.startAt!.getTime() + 45 * 60_000);
    expect(new Date(responseExpiry).getTime()).toBe(attempt.expiresAt?.getTime());
  });

  it('IT-05 randomizes each attempt mapping without breaking response or answer-key identity', async () => {
    const attemptEvidence: Array<{ attemptId: string; mappings: Awaited<ReturnType<typeof prisma.presentationMapping.findMany>>; token: string }> = [];
    for (const candidateId of [ids.randomCandidateOne, ids.randomCandidateTwo]) {
      setUser(identity(candidateId, 'candidate'));
      const started = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: randomAssessmentId }));
      expect(started.status).toBe(201);
      const { attemptId } = await responseJson(started) as { attemptId: string };
      const token = started.cookies.get(`exam_session_${attemptId}`)?.value;
      expect(token).toBeTruthy();
      const mappings = await prisma.presentationMapping.findMany({
        where: { attemptId },
        orderBy: { displayPosition: 'asc' },
      });
      expect(mappings).toHaveLength(3);
      expect(mappings.map((item) => item.displayPosition)).toEqual([1, 2, 3]);
      expect(mappings.filter((item) => item.questionId !== ids.essay).every((item) => Boolean(item.optionOrderJson))).toBe(true);
      expect(mappings.find((item) => item.questionId === ids.essay)?.optionOrderJson).toBeNull();
      expect(await prisma.response.count({ where: { attemptId } })).toBe(3);
      attemptEvidence.push({ attemptId, mappings, token: token! });

      const attemptPage = await getAttempt(
        apiRequest(`/api/attempts/${attemptId}`, 'GET', undefined, { attemptId, token: token! }),
        routeParams({ id: attemptId }),
      );
      expect(attemptPage.status).toBe(200);
      const pageBody = await attemptPage.text();
      expect(pageBody).not.toContain('correctOptionId');
      expect(pageBody).not.toContain('isCorrect');
    }

    const questionMapping = attemptEvidence[0].mappings.find((mapping) => mapping.questionId === ids.multipleChoiceOne)!;
    const displayedOptions = JSON.parse(questionMapping.optionOrderJson!) as string[];
    const answerKey = await prisma.answerKey.findFirstOrThrow({ where: { questionId: ids.multipleChoiceOne } });
    expect(displayedOptions).toContain(answerKey.correctOptionId);
    setUser(identity(ids.randomCandidateOne, 'candidate'));
    const synced = await syncResponses(
      apiRequest(`/api/attempts/${attemptEvidence[0].attemptId}/sync`, 'POST', {
        responses: [responsePayload(ids.multipleChoiceOne, answerKey.correctOptionId)],
      }, { attemptId: attemptEvidence[0].attemptId, token: attemptEvidence[0].token }),
      routeParams({ id: attemptEvidence[0].attemptId }),
    );
    expect(synced.status).toBe(200);
    expect(await prisma.response.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attemptEvidence[0].attemptId, questionId: ids.multipleChoiceOne } },
    })).toMatchObject({ selectedOptionId: answerKey.correctOptionId, syncStatus: 'synced' });
  });

  it('IT-06 saves answer edits, word counts, and response versions while rejecting unrelated questions', async () => {
    const { attempt, token } = await makeDirectAttempt(ids.candidate, randomAssessmentId);
    setUser(identity(ids.candidate, 'candidate'));
    const synced = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
        responses: [responsePayload(ids.multipleChoiceOne, `it-correct-${suffix}`)],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(synced.status).toBe(200);
    expect(await prisma.response.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.multipleChoiceOne } },
    })).toMatchObject({ selectedOptionId: `it-correct-${suffix}`, syncStatus: 'synced' });
    expect(await prisma.responseVersion.count({
      where: { response: { attemptId: attempt.id, questionId: ids.multipleChoiceOne } },
    })).toBe(1);

    const stale = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
        responses: [{
          ...responsePayload(ids.multipleChoiceOne, `it-wrong-one-${suffix}`),
          answerChanges: 0,
        }],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(stale.status).toBe(200);
    expect(await prisma.response.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.multipleChoiceOne } },
    })).toMatchObject({ selectedOptionId: `it-correct-${suffix}`, answerChanges: 1 });
    expect(await prisma.responseVersion.count({
      where: { response: { attemptId: attempt.id, questionId: ids.multipleChoiceOne } },
    })).toBe(1);

    const invalid = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
        responses: [responsePayload(ids.foreign, null, 'Not part of this exam')],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(invalid.status).toBe(400);
    expect(await prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.foreign } },
    })).toBeNull();

    const firstEssayText = 'The doctrine allocates public power among branches.';
    const editedEssayText = 'The doctrine of separation of powers allocates public authority among branches.';
    const essayEdit = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
        responses: [responsePayload(ids.essay, null, firstEssayText)],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(essayEdit.status).toBe(200);
    const essayUpdate = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
        responses: [responsePayload(ids.essay, null, editedEssayText)],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(essayUpdate.status).toBe(200);
    const essayResponse = await prisma.response.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.essay } },
    });
    expect(essayResponse).toMatchObject({ currentText: editedEssayText, wordCount: 11, syncStatus: 'synced' });
    expect(await prisma.responseVersion.findMany({
      where: { responseId: essayResponse.id },
      orderBy: { versionNum: 'asc' },
    })).toMatchObject([
      { text: firstEssayText, versionNum: 1, saveType: 'sync' },
      { text: editedEssayText, versionNum: 2, saveType: 'sync' },
    ]);
  });

  it('IT-08 prevents invalid sessions and other candidates from reading or writing an attempt', async () => {
    const { attempt, token } = await makeDirectAttempt(ids.candidateTwo, randomAssessmentId);
    setUser(identity(ids.candidateTwo, 'candidate'));
    const duplicateStart = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: randomAssessmentId }));
    expect(duplicateStart.status).toBe(409);
    expect(await prisma.attempt.count({ where: { candidateId: ids.candidateTwo, status: 'in_progress' } })).toBe(1);
    const ownerRead = await getAttempt(
      apiRequest(`/api/attempts/${attempt.id}`, 'GET', undefined, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(ownerRead.status).toBe(200);
    const missingSession = await getAttempt(
      apiRequest(`/api/attempts/${attempt.id}`, 'GET'),
      routeParams({ id: attempt.id }),
    );
    expect(missingSession.status).toBe(409);
    const invalidSession = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', { responses: [] }, { attemptId: attempt.id, token: 'stale-invalid-session-token' }),
      routeParams({ id: attempt.id }),
    );
    expect(invalidSession.status).toBe(409);
    const validSessionStillWorks = await getAttempt(
      apiRequest(`/api/attempts/${attempt.id}`, 'GET', undefined, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(validSessionStillWorks.status).toBe(200);

    setUser(identity(ids.candidate, 'candidate'));
    const read = await getAttempt(apiRequest(`/api/attempts/${attempt.id}`, 'GET'), routeParams({ id: attempt.id }));
    expect(read.status).toBe(403);
    const sync = await syncResponses(
      apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', { responses: [] }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(sync.status).toBe(403);
    const submission = await submitAttempt(
      apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', { responses: [] }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(submission.status).toBe(403);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
      status: 'in_progress',
      isActive: true,
    });
  });

  it('IT-10 scores correct, incorrect, and unanswered objective responses and persists results', async () => {
    const { attempt, token } = await makeDirectAttempt(ids.candidateTwo, objectiveAssessmentId);
    setUser(identity(ids.candidateTwo, 'candidate'));
    const submitted = await submitAttempt(
      apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', {
        responses: [
          responsePayload(ids.multipleChoiceOne, `it-correct-${suffix}`),
          responsePayload(ids.multipleChoiceTwo, `it-wrong-four-${suffix}`),
        ],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(submitted.status).toBe(200);
    expect(await prisma.objectiveOutcome.findMany({
      where: { attemptId: attempt.id },
      orderBy: { questionId: 'asc' },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: ids.multipleChoiceOne, isCorrect: true, score: 2, maxMark: 2 }),
      expect.objectContaining({ questionId: ids.multipleChoiceTwo, isCorrect: false, score: 0, maxMark: 2 }),
      expect.objectContaining({ questionId: ids.multipleChoiceThree, isUnanswered: true, isCorrect: false, score: 0, maxMark: 2 }),
    ]));
    const savedAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(savedAttempt).toMatchObject({ status: 'submitted', isActive: false });
    expect(savedAttempt.submissionReceipt).toBeTruthy();
    expect(await prisma.result.findUniqueOrThrow({ where: { attemptId: attempt.id } })).toMatchObject({
      totalObjectiveScore: 2,
      totalScore: 2,
    });
    setUser(identity(ids.examOfficer, 'exam_officer'));
    const reported = await getResults(apiRequest('/api/results', 'GET'));
    const reportBody = await responseJson(reported);
    expect(reportBody.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        attemptId: attempt.id,
        totalObjectiveScore: 2,
        totalScore: 2,
        attempt: expect.objectContaining({ candidateId: ids.candidateTwo }),
      }),
    ]));
  });

  it('IT-09 automatically submits a violation attempt with a distinct terminal status', async () => {
    const { attempt, token } = await makeDirectAttempt(ids.candidate, objectiveAssessmentId);
    setUser(identity(ids.candidate, 'candidate'));
    const response = await submitAttempt(
      apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', {
        responses: [responsePayload(ids.multipleChoiceOne, `it-correct-${suffix}`)],
        reason: 'AUTO_SUBMITTED_VIOLATION',
        violationCount: 3,
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'AUTO_SUBMITTED_VIOLATION' });
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
      status: 'auto_submitted_violation',
      isActive: false,
    });
  });

  it('IT-09 confirms one submission receipt, closes the attempt, and rejects replay', async () => {
    const { attempt, token } = await makeDirectAttempt(ids.candidate, objectiveAssessmentId);
    setUser(identity(ids.candidate, 'candidate'));
    const first = await submitAttempt(
      apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', {
        responses: [responsePayload(ids.multipleChoiceOne, `it-correct-${suffix}`)],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(first.status).toBe(200);
    const savedAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(savedAttempt).toMatchObject({ status: 'submitted', isActive: false });
    expect(savedAttempt.submissionReceipt).toBeTruthy();
    expect(savedAttempt.receiptAt).toBeInstanceOf(Date);
    expect(savedAttempt.submittedAt).toBeInstanceOf(Date);
    const retrieved = await getAttempt(
      apiRequest(`/api/attempts/${attempt.id}`, 'GET', undefined, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(retrieved.status).toBe(200);
    expect(await retrieved.json()).toMatchObject({
      submissionReceipt: savedAttempt.submissionReceipt,
      receiptAt: savedAttempt.receiptAt?.toISOString(),
      status: 'submitted',
    });
    const replay = await submitAttempt(
      apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', {
        responses: [responsePayload(ids.multipleChoiceOne, `it-wrong-one-${suffix}`)],
      }, { attemptId: attempt.id, token }),
      routeParams({ id: attempt.id }),
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.result.count({ where: { attemptId: attempt.id } })).toBe(1);
    expect(await prisma.response.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.multipleChoiceOne } },
    })).toMatchObject({ selectedOptionId: `it-correct-${suffix}` });
  });

  it('IT-12 stores lecturer-controlled essay grades only within bounds', async () => {
    const { attempt } = await makeDirectAttempt(ids.candidateTwo, subjectiveAssessmentId, 'submitted');
    setUser(identity(ids.candidateTwo, 'candidate'));
    const denied = await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        officialGrade: 7,
        lecturerDecision: 'accepted',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    expect(denied.status).toBe(403);

    setUser(identity(ids.lecturer, 'lecturer'));
    const gradingQueue = await getGradingQueue(apiRequest('/api/grading', 'GET'));
    expect(gradingQueue.status).toBe(200);
    expect(await gradingQueue.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: attempt.id, candidateId: ids.candidateTwo }),
    ]));
    const invalid = await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        officialGrade: 11,
        lecturerDecision: 'accepted',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    expect(invalid.status).toBe(400);
    const negative = await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        officialGrade: -1,
        lecturerDecision: 'accepted',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    expect(negative.status).toBe(400);
    const accepted = await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        provisionalScore: 8,
        officialGrade: 7,
        lecturerDecision: 'modified',
        notes: 'Lecturer-reviewed integration result',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    expect(accepted.status).toBe(200);
    expect(await prisma.gradeDecision.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.essay } },
    })).toMatchObject({
      officialGrade: 7,
      provisionalScore: 8,
      lecturerDecision: 'modified',
      gradedBy: ids.lecturer,
    });
  });

  it('IT-15 keeps results protected until authorized grading and release', async () => {
    const { attempt } = await makeDirectAttempt(ids.candidate, subjectiveAssessmentId, 'submitted');
    await prisma.result.create({ data: { attemptId: attempt.id, status: 'pending' } });
    setUser(identity(ids.candidate, 'candidate'));
    const hidden = await getResults(apiRequest('/api/results', 'GET'));
    expect((await responseJson(hidden)).results).toEqual([]);

    setUser(identity(ids.lecturer, 'lecturer'));
    const earlyRelease = await releaseResult(apiRequest('/api/results/release', 'POST', { attemptId: attempt.id }));
    expect(earlyRelease.status).toBe(400);
    await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        officialGrade: 6,
        lecturerDecision: 'accepted',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    const release = await releaseResult(apiRequest('/api/results/release', 'POST', { attemptId: attempt.id }));
    expect(release.status).toBe(200);
    expect(await prisma.auditEvent.findFirst({
      where: { actionType: 'result_released', entityId: String((await responseJson(release)).id) },
    })).toMatchObject({ actorId: ids.lecturer });

    setUser(identity(ids.candidate, 'candidate'));
    const visible = await getResults(apiRequest('/api/results', 'GET'));
    const resultList = (await responseJson(visible)).results as Array<{ attemptId: string; status: string }>;
    expect(resultList).toEqual(expect.arrayContaining([
      expect.objectContaining({ attemptId: attempt.id, status: 'released' }),
    ]));
  });

  it('IT-13 keeps generated AI questions in draft and rejects malformed provider output', async () => {
    setUser(identity(ids.lecturer, 'lecturer'));
    aiState.response = JSON.stringify({
      questions: [{
        text: 'A generated question from the controlled provider.',
        topic: 'Integration topic',
        difficulty: 'medium',
        type: 'essay',
        markingScheme: {
          method: 'human_grading',
          maxMark: 10,
          rubric: [{ criterion: 'Knowledge', maxMark: 5 }, { criterion: 'Analysis', maxMark: 5 }],
        },
      }],
    });
    const invalid = await generateQuestions(apiRequest('/api/ai/generate-questions', 'POST', {
      courseId: ids.course,
      topic: 'Contracts',
      questionType: 'essay',
      difficulty: 'medium',
      count: 1,
      courseMaterial: 'Synthetic test course material.',
      markingRules: 'Use the stated two-criterion rubric.',
    }));
    expect(invalid.status).toBe(200);

    const streamText = await invalid.text();
    const completed = streamText.split('\n').find((line) => line.startsWith('data: {"status":"completed"'));
    expect(completed).toBeTruthy();
    const event = JSON.parse(completed!.slice(6)) as { result: { draftIds: string[] } };
    const generated = await prisma.question.findUniqueOrThrow({ where: { id: event.result.draftIds[0] } });
    expect(generated).toMatchObject({ status: 'draft', createdBy: ids.lecturer, type: 'essay' });
    expect(await prisma.assessmentItem.count({ where: { questionId: generated.id } })).toBe(0);
    expect(await prisma.aiRequest.findFirstOrThrow({
      where: { actorId: ids.lecturer, requestType: 'question_generation' },
    })).toMatchObject({ actorId: ids.lecturer, requestType: 'question_generation' });

    aiState.response = JSON.stringify({ questions: [{
      text: 'Malformed requested settings',
      topic: 'Contracts',
      difficulty: 'hard',
      type: 'essay',
      markingScheme: { method: 'human_grading', maxMark: 10, rubric: [{ criterion: 'Only', maxMark: 10 }] },
    }] });
    const before = await prisma.question.count({ where: { courseId: ids.course } });
    const malformed = await generateQuestions(apiRequest('/api/ai/generate-questions', 'POST', {
      courseId: ids.course,
      topic: 'Contracts',
      questionType: 'essay',
      difficulty: 'medium',
      count: 1,
      courseMaterial: 'Synthetic test course material.',
      markingRules: 'Use the stated two-criterion rubric.',
    }));
    expect((await malformed.text())).toContain('failed validation');
    expect(await prisma.question.count({ where: { courseId: ids.course } })).toBe(before);

    aiState.unavailable = true;
    const unavailable = await generateQuestions(apiRequest('/api/ai/generate-questions', 'POST', {
      courseId: ids.course,
      topic: 'Contracts',
      questionType: 'essay',
      difficulty: 'medium',
      count: 1,
      courseMaterial: 'Synthetic test course material.',
      markingRules: 'Use the stated two-criterion rubric.',
    }));
    expect(unavailable.status).toBe(503);
    aiState.unavailable = false;

    const manualQuestion = await createQuestion(apiRequest('/api/questions', 'POST', {
      courseId: ids.course,
      type: 'essay',
      text: 'Manual Faculty of Law question remains available after AI failure.',
    }));
    expect(manualQuestion.status).toBe(201);
  });

  it('IT-14 keeps AI assessment recommendations advisory and handles provider unavailability', async () => {
    const { attempt } = await makeDirectAttempt(ids.candidateTwo, subjectiveAssessmentId, 'submitted');
    setUser(identity(ids.lecturer, 'lecturer'));
    aiState.response = JSON.stringify({
      suggested_score: 7,
      max_score: 10,
      strengths: ['Sound rule statement'],
      weaknesses: ['Application needs detail'],
      criterion_observations: [
        { criterion: 'Knowledge', met: false, comment: 'Accurate legal rule with some omissions.', awarded_score: 4, max_score: 5 },
        { criterion: 'Analysis', met: false, comment: 'Application is incomplete.', awarded_score: 3, max_score: 5 },
      ],
      uncertainty_level: 'low',
      rationale: 'Evidence supports a provisional score.',
    });
    const recommended = await assessResponse(apiRequest('/api/ai/assess', 'POST', {
      attemptId: attempt.id,
      questionId: ids.essay,
      questionText: 'Explain the tested principle.',
      responseText: 'A synthetic candidate answer.',
      markingScheme: {
        maxMark: 10,
        rubric: [{ criterion: 'Knowledge' }, { criterion: 'Analysis' }],
      },
    }));
    const recommendationText = await recommended.text();
    expect(recommendationText).toContain('"status":"completed"');
    const finalLine = recommendationText.split('\n').find((line) => line.startsWith('data: {"status":"completed"'));
    expect(finalLine).toBeTruthy();
    const recommendation = JSON.parse(finalLine!.slice(6)).result;
    expect(recommendation.validation.issues).toEqual([]);
    expect(recommendation.validation).toMatchObject({
      passed: true,
      review_required: false,
    });
    expect(await prisma.gradeDecision.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.essay } },
    })).toMatchObject({ method: 'ai_recommendation', provisionalScore: 7, officialGrade: null, lecturerDecision: 'pending' });
    expect(await prisma.aiRequest.findFirstOrThrow({
      where: { attemptId: attempt.id, questionId: ids.essay, requestType: 'assessment_recommendation' },
    })).toMatchObject({ actorId: ids.lecturer, lecturerDecision: null });

    const aiRequestCount = await prisma.aiRequest.count({ where: { attemptId: attempt.id } });
    aiState.unavailable = true;
    const unavailable = await assessResponse(apiRequest('/api/ai/assess', 'POST', {
      questionText: 'Standalone sample',
      responseText: 'Synthetic answer',
      maxMark: 10,
    }));
    expect(unavailable.status).toBe(503);
    aiState.unavailable = false;
    expect(await prisma.aiRequest.count({ where: { attemptId: attempt.id } })).toBe(aiRequestCount);

    const lecturerGrade = await saveGrade(
      apiRequest(`/api/grading/${attempt.id}/${ids.essay}`, 'PATCH', {
        officialGrade: 6,
        lecturerDecision: 'accepted',
      }),
      routeParams({ attemptId: attempt.id, questionId: ids.essay }),
    );
    expect(lecturerGrade.status).toBe(200);
    expect(await prisma.gradeDecision.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.essay } },
    })).toMatchObject({ officialGrade: 6, lecturerDecision: 'accepted', gradedBy: ids.lecturer });
  });

  it('IT-15 records monitoring events against the owned attempt and restricts staff review', async () => {
    const { attempt } = await makeDirectAttempt(ids.candidate, randomAssessmentId);
    setUser(identity(ids.candidate, 'candidate'));
    const created = await createMonitoringEvent(apiRequest('/api/monitoring/events', 'POST', {
      attemptId: attempt.id,
      eventType: 'tab_switch',
      detail: { tabCount: 2, capturedAt: 'synthetic' },
    }));
    expect(created.status).toBe(201);
    const eventId = String((await responseJson(created)).id);
    const persistedEvent = await prisma.monitoringEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(persistedEvent).toMatchObject({ attemptId: attempt.id, eventType: 'tab_switch' });
    expect(persistedEvent.occurredAt).toBeInstanceOf(Date);
    expect(await prisma.auditEvent.findFirstOrThrow({
      where: { actionType: 'monitoring_event_logged', entityId: eventId },
    })).toMatchObject({ actorId: ids.candidate, entityType: 'monitoring_event' });

    const foreign = await createMonitoringEvent(apiRequest('/api/monitoring/events', 'POST', {
      attemptId: (await makeDirectAttempt(ids.candidateTwo, randomAssessmentId)).attempt.id,
      eventType: 'tab_switch',
    }));
    expect(foreign.status).toBe(403);
    expect((await getMonitoringEvents(apiRequest(`/api/monitoring/events?attemptId=${attempt.id}`, 'GET'))).status).toBe(403);
    const deniedReview = await reviewMonitoringEvent(apiRequest('/api/monitoring/events', 'PATCH', {
      eventId,
      reviewed: true,
      flagged: true,
    }));
    expect(deniedReview.status).toBe(403);

    setUser(identity(ids.invigilator, 'invigilator'));
    const events = await getMonitoringEvents(apiRequest(`/api/monitoring/events?attemptId=${attempt.id}`, 'GET'));
    expect(events.status).toBe(200);
    expect(await events.text()).toContain('tab_switch');
    const review = await reviewMonitoringEvent(apiRequest('/api/monitoring/events', 'PATCH', {
      eventId,
      reviewed: true,
      flagged: false,
    }));
    expect(review.status).toBe(200);
    expect(await prisma.monitoringEvent.findUniqueOrThrow({ where: { id: eventId } })).toMatchObject({
      reviewed: true,
      reviewedBy: ids.invigilator,
    });
  });

  it('IT-15 audits administrative reset and verifies the audit hash chain', async () => {
    const { attempt } = await makeDirectAttempt(ids.candidateTwo, objectiveAssessmentId);
    setUser(identity(ids.candidate, 'candidate'));
    const denied = await resetAttempt(apiRequest('/api/admin/reset-attempt', 'POST', {
      attemptId: attempt.id,
      reason: 'Unauthorized reset should be rejected',
    }));
    expect(denied.status).toBe(403);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
      status: 'in_progress',
      isActive: true,
    });

    const candidateAuditAccess = await verifyAudit(apiRequest('/api/audit/verify', 'GET'));
    expect(candidateAuditAccess.status).toBe(403);

    await prisma.auditEvent.deleteMany();
    setUser(identity(ids.admin, 'admin'));
    const reset = await resetAttempt(apiRequest('/api/admin/reset-attempt', 'POST', {
      attemptId: attempt.id,
      reason: 'Integration recovery validation',
    }));
    expect(reset.status).toBe(200);
    expect(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
      status: 'reset',
      isActive: false,
    });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { actionType: 'attempt_reset' } });
    expect(event).toMatchObject({ actorId: ids.admin, entityType: 'attempt', entityId: attempt.id });
    expect(event.occurredAt).toBeInstanceOf(Date);

    const valid = await verifyAudit(apiRequest('/api/audit/verify', 'GET'));
    expect((await responseJson(valid)).verified).toBe(true);
    await prisma.auditEvent.update({ where: { id: event.id }, data: { hash: 'tampered-hash' } });
    const invalid = await verifyAudit(apiRequest('/api/audit/verify', 'GET'));
    expect((await responseJson(invalid)).verified).toBe(false);
    await prisma.auditEvent.update({ where: { id: event.id }, data: { hash: event.hash } });
    const restored = await verifyAudit(apiRequest('/api/audit/verify', 'GET'));
    expect((await responseJson(restored)).verified).toBe(true);
  });

  it('IT-11 records provisional short-answer outcomes separately from lecturer decisions', async () => {
        const { attempt, token } = await makeDirectAttempt(ids.candidateTwo, shortAnswerAssessmentId);
        setUser(identity(ids.candidateTwo, 'candidate'));
        const submitted = await submitAttempt(
          apiRequest(`/api/attempts/${attempt.id}/submit`, 'POST', {
            responses: [
              responsePayload(ids.shortAnswerExact, null, 'Separation of powers'),
              responsePayload(ids.shortAnswerEquivalent, null, 'Division of governmental powers'),
              responsePayload(ids.shortAnswerTypo, null, 'stare decisisx'),
              responsePayload(ids.shortAnswerAmbiguous, null, 'The circumstances may support judicial review, but the position is not clear.'),
            ],
          }, { attemptId: attempt.id, token }),
          routeParams({ id: attempt.id }),
        );
        expect(submitted.status).toBe(200);

        const decisions = await prisma.gradeDecision.findMany({
          where: { attemptId: attempt.id },
        });
        expect(decisions).toEqual(expect.arrayContaining([
          expect.objectContaining({ questionId: ids.shortAnswerExact, provisionalScore: 5, officialGrade: null, lecturerDecision: 'pending', method: 'exact_match' }),
          expect.objectContaining({ questionId: ids.shortAnswerEquivalent, provisionalScore: 5, officialGrade: null, lecturerDecision: 'pending', method: 'acceptable_answer' }),
          expect.objectContaining({ questionId: ids.shortAnswerTypo, provisionalScore: 5, officialGrade: null, lecturerDecision: 'pending', method: 'exact_match' }),
          expect.objectContaining({ questionId: ids.shortAnswerAmbiguous, provisionalScore: null, officialGrade: null, lecturerDecision: 'pending', method: 'human_grading' }),
        ]));
        expect(await prisma.result.findUniqueOrThrow({ where: { attemptId: attempt.id } }))
          .toMatchObject({ status: 'pending' });

        setUser(identity(ids.lecturer, 'lecturer'));
        const accepted = await saveGrade(
          apiRequest(`/api/grading/${attempt.id}/${ids.shortAnswerExact}`, 'PATCH', {
            provisionalScore: 5,
            officialGrade: 4,
            lecturerDecision: 'modified',
            notes: 'Lecturer moderated the automatically scored answer.',
          }),
          routeParams({ attemptId: attempt.id, questionId: ids.shortAnswerExact }),
        );
        expect(accepted.status).toBe(200);
        const rejected = await saveGrade(
          apiRequest(`/api/grading/${attempt.id}/${ids.shortAnswerAmbiguous}`, 'PATCH', {
            lecturerDecision: 'rejected',
            notes: 'Requires a human re-mark.',
          }),
          routeParams({ attemptId: attempt.id, questionId: ids.shortAnswerAmbiguous }),
        );
        expect(rejected.status).toBe(200);
        expect(await prisma.gradeDecision.findUniqueOrThrow({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.shortAnswerExact } },
        })).toMatchObject({ provisionalScore: 5, officialGrade: 4, lecturerDecision: 'modified', gradedBy: ids.lecturer });
        expect(await prisma.gradeDecision.findUniqueOrThrow({
          where: { attemptId_questionId: { attemptId: attempt.id, questionId: ids.shortAnswerAmbiguous } },
        })).toMatchObject({ provisionalScore: null, officialGrade: null, lecturerDecision: 'rejected', gradedBy: ids.lecturer });
      });

  it('Supplemental: synchronizes responses for 25 synthetic candidates concurrently', async () => {
    const attempts = await Promise.all(performanceCandidateIds.map((candidateId) =>
      makeDirectAttempt(candidateId, objectiveAssessmentId),
    ));
    const attemptIds = attempts.map(({ attempt }) => attempt.id);
    const startedAt = performance.now();
    const requests = await Promise.all(attempts.map(async ({ attempt, token }, index) => {
      const candidateId = performanceCandidateIds[index];
      setUser(identity(candidateId, 'candidate'));
      const requestStartedAt = performance.now();
      const response = await syncResponses(
        apiRequest(`/api/attempts/${attempt.id}/sync`, 'POST', {
          responses: [responsePayload(ids.multipleChoiceOne, `it-correct-${suffix}`)],
        }, { attemptId: attempt.id, token }),
        routeParams({ id: attempt.id }),
      );
      return { attemptId: attempt.id, durationMs: performance.now() - requestStartedAt, status: response.status };
    }));
    const wallClockMs = performance.now() - startedAt;
    const persisted = await prisma.response.findMany({
      where: {
        attemptId: { in: attemptIds },
        questionId: ids.multipleChoiceOne,
      },
    });
    const sortedLatency = requests.map(({ durationMs }) => durationMs).sort((left, right) => left - right);
    const percentile50 = sortedLatency[Math.ceil(sortedLatency.length * 0.5) - 1];
    const percentile95 = sortedLatency[Math.ceil(sortedLatency.length * 0.95) - 1];
    const throughput = requests.length / (wallClockMs / 1000);

    expect(requests).toHaveLength(25);
    expect(requests.every(({ status }) => status === 200)).toBe(true);
    expect(persisted).toHaveLength(25);
    expect(persisted.every((response) => response.syncStatus === 'synced'
      && response.selectedOptionId === `it-correct-${suffix}`)).toBe(true);
    process.stdout.write(
      `[SYSTEM-PERF] 25 concurrent synthetic candidate response-sync handlers; `
      + `loopback PostgreSQL; wall=${wallClockMs.toFixed(1)}ms; `
      + `request-p50=${percentile50.toFixed(1)}ms; request-p95=${percentile95.toFixed(1)}ms; `
      + `throughput=${throughput.toFixed(1)} requests/s; errors=0; persisted=25/25. `
      + 'Local handler/database smoke measurement only; no production SLA inferred.\n',
    );
  });

  it('IT-E2E-01 completes the synthetic 25-candidate examination journey', async () => {
    const assessment = await prisma.assessment.create({
      data: {
        id: `it-e2e-assessment-${randomUUID()}`,
        courseId: ids.course,
        title: 'Synthetic Constitutional Law End-to-End Examination',
        durationMins: 90,
        status: 'published',
        randomizeQuestions: true,
        randomizeOptions: true,
        maxAttempts: 1,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 3_600_000),
        createdBy: ids.lecturer,
        items: {
          create: [
            { questionId: ids.multipleChoiceOne, displayOrder: 1, maxMark: 5 },
            { questionId: ids.shortAnswerExact, displayOrder: 2, maxMark: 5 },
            { questionId: ids.essay, displayOrder: 3, maxMark: 10 },
          ],
        },
      },
    });
    const questionIds = [ids.multipleChoiceOne, ids.shortAnswerExact, ids.essay];
    const answerKey = await prisma.answerKey.findFirstOrThrow({ where: { questionId: ids.multipleChoiceOne } });
    const readinessAt = new Date();
    await prisma.readinessCheck.createMany({
      data: performanceCandidateIds.map((candidateId) => ({
        candidateId,
        checkType: 'readiness_summary',
        status: 'passed',
        detailsJson: JSON.stringify({ failedCount: 0, blocked: false }),
        checkedAt: readinessAt,
      })),
    });

    const journeys: Array<{
      candidateId: string;
      attemptId: string;
      token: string;
      questionOrder: string[];
    }> = [];

    for (const candidateId of performanceCandidateIds) {
      const email = `${candidateId}@example.test`;
      const authenticated = await authorizeCredentials({ email, password: 'integration-password', portal: 'candidate' });
      expect(authenticated).toMatchObject({ id: candidateId, role: 'candidate' });
      setUser(authenticated);

      const started = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: assessment.id }));
      expect(started.status).toBe(201);
      const { attemptId } = await responseJson(started) as { attemptId: string };
      const token = started.cookies.get(`exam_session_${attemptId}`)?.value;
      expect(token).toBeTruthy();

      const mappings = await prisma.presentationMapping.findMany({
        where: { attemptId },
        orderBy: { displayPosition: 'asc' },
      });
      expect(mappings.map((mapping) => mapping.questionId).sort()).toEqual([...questionIds].sort());
      expect(mappings.map((mapping) => mapping.displayPosition)).toEqual([1, 2, 3]);
      const mcqMapping = mappings.find((mapping) => mapping.questionId === ids.multipleChoiceOne)!;
      expect(JSON.parse(mcqMapping.optionOrderJson!)).toContain(answerKey.correctOptionId);

      const attemptPage = await getAttempt(
        apiRequest(`/api/attempts/${attemptId}`, 'GET', undefined, { attemptId, token: token! }),
        routeParams({ id: attemptId }),
      );
      expect(attemptPage.status).toBe(200);
      const candidatePayload = await attemptPage.text();
      expect(candidatePayload).not.toContain('correctOptionId');
      expect(candidatePayload).not.toContain('isCorrect');

      const answerText = `Synthetic candidate ${candidateId} analyzes separation of powers.`;
      const responses = [
        responsePayload(ids.multipleChoiceOne, answerKey.correctOptionId),
        responsePayload(ids.shortAnswerExact, null, 'Separation of powers'),
        responsePayload(ids.essay, null, answerText),
      ];
      const firstSync = await syncResponses(
        apiRequest(`/api/attempts/${attemptId}/sync`, 'POST', { responses }, { attemptId, token: token! }),
        routeParams({ id: attemptId }),
      );
      expect(firstSync.status).toBe(200);

      if (candidateId === performanceCandidateIds[0]) {
        const revisedEssay = `${answerText} The branches constrain one another.`;
        const revised = await syncResponses(
          apiRequest(`/api/attempts/${attemptId}/sync`, 'POST', {
            responses: [responsePayload(ids.essay, null, revisedEssay)],
          }, { attemptId, token: token! }),
          routeParams({ id: attemptId }),
        );
        expect(revised.status).toBe(200);
      }

      journeys.push({
        candidateId,
        attemptId,
        token: token!,
        questionOrder: mappings.map((mapping) => mapping.questionId),
      });
    }

    const monitoredJourney = journeys[0];
    setUser(identity(monitoredJourney.candidateId, 'candidate'));
    const monitoringResponse = await createMonitoringEvent(apiRequest('/api/monitoring/events', 'POST', {
      attemptId: monitoredJourney.attemptId,
      eventType: 'tab_switch',
      detail: { source: 'synthetic end-to-end test' },
    }));
    expect(monitoringResponse.status).toBe(201);
    const monitoringEventId = String((await responseJson(monitoringResponse)).id);
    const candidateReview = await reviewMonitoringEvent(apiRequest('/api/monitoring/events', 'PATCH', {
      eventId: monitoringEventId,
      reviewed: true,
      flagged: false,
    }));
    expect(candidateReview.status).toBe(403);

    for (const journey of journeys) {
      setUser(identity(journey.candidateId, 'candidate'));
      const answerText = `Synthetic candidate ${journey.candidateId} analyzes separation of powers.`;
      const finalEssay = journey.candidateId === performanceCandidateIds[0]
        ? `${answerText} The branches constrain one another.`
        : answerText;
      const finalResponses = [
        responsePayload(ids.multipleChoiceOne, answerKey.correctOptionId),
        responsePayload(ids.shortAnswerExact, null, 'Separation of powers'),
        responsePayload(ids.essay, null, finalEssay),
      ];
      const submitted = await submitAttempt(
        apiRequest(`/api/attempts/${journey.attemptId}/submit`, 'POST', { responses: finalResponses }, {
          attemptId: journey.attemptId,
          token: journey.token,
        }),
        routeParams({ id: journey.attemptId }),
      );
      expect(submitted.status).toBe(200);

      const savedAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: journey.attemptId } });
      expect(savedAttempt).toMatchObject({ status: 'submitted', isActive: false });
      expect(savedAttempt.submissionReceipt).toBeTruthy();
      expect(savedAttempt.receiptAt).toBeInstanceOf(Date);

      const duplicate = await submitAttempt(
        apiRequest(`/api/attempts/${journey.attemptId}/submit`, 'POST', { responses: finalResponses }, {
          attemptId: journey.attemptId,
          token: journey.token,
        }),
        routeParams({ id: journey.attemptId }),
      );
      expect(duplicate.status).toBeGreaterThanOrEqual(400);

      const restart = await startAttempt(apiRequest('/api/attempts/start', 'POST', { assessmentId: assessment.id }));
      expect(restart.status).toBe(400);
      expect(await prisma.attempt.count({ where: { candidateId: journey.candidateId, assessmentId: assessment.id } })).toBe(1);

      const beforeRelease = await getResults(apiRequest('/api/results', 'GET'));
      expect((await responseJson(beforeRelease)).results).toEqual([]);
    }

    setUser(identity(ids.invigilator, 'invigilator'));
    expect((await getMonitoringEvents(apiRequest(`/api/monitoring/events?attemptId=${monitoredJourney.attemptId}`, 'GET'))).status).toBe(200);
    const reviewedEvent = await reviewMonitoringEvent(apiRequest('/api/monitoring/events', 'PATCH', {
      eventId: monitoringEventId,
      reviewed: true,
      flagged: false,
    }));
    expect(reviewedEvent.status).toBe(200);

    for (const journey of journeys) {
      setUser(identity(ids.lecturer, 'lecturer'));
      const shortAnswerGrade = await saveGrade(
        apiRequest(`/api/grading/${journey.attemptId}/${ids.shortAnswerExact}`, 'PATCH', {
          officialGrade: 5,
          lecturerDecision: 'accepted',
        }),
        routeParams({ attemptId: journey.attemptId, questionId: ids.shortAnswerExact }),
      );
      expect(shortAnswerGrade.status).toBe(200);
      const essayGrade = await saveGrade(
        apiRequest(`/api/grading/${journey.attemptId}/${ids.essay}`, 'PATCH', {
          officialGrade: 8,
          lecturerDecision: 'accepted',
        }),
        routeParams({ attemptId: journey.attemptId, questionId: ids.essay }),
      );
      expect(essayGrade.status).toBe(200);

      const result = await prisma.result.findUniqueOrThrow({ where: { attemptId: journey.attemptId } });
      expect(result).toMatchObject({ totalObjectiveScore: 5, totalSubjectiveScore: 13, totalScore: 18, status: 'graded' });
      setUser(identity(journey.candidateId, 'candidate'));
      expect((await responseJson(await getResults(apiRequest('/api/results', 'GET')))).results).toEqual([]);
    }

    setUser(identity(ids.examOfficer, 'exam_officer'));
    const examOfficerRelease = await releaseResult(apiRequest('/api/results/release', 'POST', {
      attemptId: journeys[0].attemptId,
    }));
    expect(examOfficerRelease.status).toBe(403);

    setUser(identity(ids.lecturer, 'lecturer'));
    for (const journey of journeys) {
      const released = await releaseResult(apiRequest('/api/results/release', 'POST', { attemptId: journey.attemptId }));
      expect(released.status).toBe(200);
    }

    for (const journey of journeys) {
      setUser(identity(journey.candidateId, 'candidate'));
      const visible = await getResults(apiRequest('/api/results', 'GET'));
      const visibleResults = (await responseJson(visible)).results as Array<{ attemptId: string; status: string }>;
      expect(visibleResults).toEqual(expect.arrayContaining([
        expect.objectContaining({ attemptId: journey.attemptId, status: 'released' }),
      ]));
    }

    setUser(identity(monitoredJourney.candidateId, 'candidate'));
    expect((await verifyAudit(apiRequest('/api/audit/verify', 'GET'))).status).toBe(403);
    setUser(identity(ids.admin, 'admin'));
    expect((await responseJson(await verifyAudit(apiRequest('/api/audit/verify', 'GET')))).verified).toBe(true);

    const attemptIds = journeys.map(({ attemptId }) => attemptId);
    const persistedAttempts = await prisma.attempt.findMany({ where: { id: { in: attemptIds } } });
    const persistedResponses = await prisma.response.findMany({
      where: { attemptId: { in: attemptIds } },
      include: { versions: true, attempt: { select: { candidateId: true, assessmentId: true } } },
    });
    expect(persistedAttempts).toHaveLength(25);
    expect(persistedAttempts.every((attempt) => attempt.status === 'submitted' && !attempt.isActive)).toBe(true);
    expect(persistedResponses).toHaveLength(75);
    expect(persistedResponses.every((response) => response.syncStatus === 'synced'
      && response.attempt.assessmentId === assessment.id
      && journeys.some((journey) => journey.attemptId === response.attemptId
        && journey.candidateId === response.attempt.candidateId))).toBe(true);
    expect(persistedResponses.filter((response) => response.attemptId === monitoredJourney.attemptId
      && response.questionId === ids.essay)[0].versions).toHaveLength(2);
    expect(await prisma.objectiveOutcome.count({ where: { attemptId: { in: attemptIds } } })).toBe(25);
    expect(await prisma.gradeDecision.count({ where: { attemptId: { in: attemptIds } } })).toBe(50);
    expect(await prisma.result.count({ where: { attemptId: { in: attemptIds }, status: 'released' } })).toBe(25);
    expect(await prisma.monitoringEvent.count({ where: { id: monitoringEventId, attemptId: monitoredJourney.attemptId } })).toBe(1);

    process.stdout.write(
      `[SYSTEM-E2E] PASS: candidates=${journeys.length}; attempts=${persistedAttempts.length}; `
      + `responses=${persistedResponses.length}; objectiveOutcomes=25; gradeDecisions=50; `
      + `releasedResults=25; monitoringEvents=1; scorePerCandidate=18/20; `
      + `uniqueQuestionOrders=${new Set(journeys.map((journey) => journey.questionOrder.join(','))).size}.\n`,
    );
  }, 60_000);
});
