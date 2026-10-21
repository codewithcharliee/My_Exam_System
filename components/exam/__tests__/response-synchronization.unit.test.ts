import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: { candidateId: '' },
}));

vi.mock('@/lib/roles', () => ({
  requireRole: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
}));

vi.mock('@/lib/session-integrity', () => ({
  validateAttemptSession: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async () => null),
}));

import { POST as syncPost } from '@/app/api/attempts/[id]/sync/route';
import { prisma } from '@/lib/prisma';

const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const options = {
  first: 'h02-option-first',
  second: 'h02-option-second',
} as const;

type SyncItem = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
};

function syncRequest(attemptId: string, responses: SyncItem[]): NextRequest {
  return new NextRequest(`http://localhost/api/attempts/${attemptId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  });
}

databaseDescribe('H02 — PostgreSQL response synchronization handler', () => {
  const suffix = randomUUID();
  const candidateOneId = `h02-candidate-one-${suffix}`;
  const candidateTwoId = `h02-candidate-two-${suffix}`;
  const creatorId = `h02-creator-${suffix}`;
  const courseId = `h02-course-${suffix}`;
  const assessmentId = `h02-assessment-${suffix}`;
  const questionIds = {
    multipleChoice: `h02-mcq-${suffix}`,
    shortAnswer: `h02-short-${suffix}`,
    essay: `h02-essay-${suffix}`,
  };
  const attemptIds = {
    first: `h02-attempt-one-${suffix}`,
    second: `h02-attempt-two-${suffix}`,
  };

  afterAll(async () => {
    await prisma.attempt.deleteMany({ where: { id: { in: Object.values(attemptIds) } } });
    await prisma.assessment.deleteMany({ where: { id: assessmentId } });
    await prisma.question.deleteMany({ where: { id: { in: Object.values(questionIds) } } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [candidateOneId, candidateTwoId, creatorId] } } });
    await prisma.$disconnect();
  });

  it('keeps final offline response versions complete, unique, and bound to each candidate attempt', async () => {
    const database = prisma;
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for the H02 PostgreSQL integration test.');
    }

    await database.user.createMany({
      data: [
        { id: creatorId, name: 'H02 Test Creator', email: `${creatorId}@example.test`, passwordHash: 'test-hash', role: 'admin' },
        { id: candidateOneId, name: 'H02 Candidate One', email: `${candidateOneId}@example.test`, passwordHash: 'test-hash', role: 'candidate' },
        { id: candidateTwoId, name: 'H02 Candidate Two', email: `${candidateTwoId}@example.test`, passwordHash: 'test-hash', role: 'candidate' },
      ],
    });
    await database.course.create({
      data: { id: courseId, code: `H02-${suffix}`, title: 'H02 Synchronization Test Course' },
    });
    await database.question.createMany({
      data: [
        { id: questionIds.multipleChoice, courseId, type: 'multiple_choice', text: 'H02 multiple choice', createdBy: creatorId },
        { id: questionIds.shortAnswer, courseId, type: 'short_answer', text: 'H02 short answer', createdBy: creatorId },
        { id: questionIds.essay, courseId, type: 'essay', text: 'H02 essay', createdBy: creatorId },
      ],
    });
    await database.assessment.create({
      data: {
        id: assessmentId,
        courseId,
        title: 'H02 Synchronization Examination',
        durationMins: 60,
        status: 'published',
        maxAttempts: 2,
        createdBy: creatorId,
        items: {
          create: Object.values(questionIds).map((questionId, index) => ({
            questionId,
            displayOrder: index + 1,
            maxMark: 2,
          })),
        },
      },
    });
    await database.attempt.createMany({
      data: [
        { id: attemptIds.first, candidateId: candidateOneId, assessmentId, status: 'in_progress', isActive: true },
        { id: attemptIds.second, candidateId: candidateTwoId, assessmentId, status: 'in_progress', isActive: true },
      ],
    });

    const baseline = [
      {
        attemptId: attemptIds.first,
        questionId: questionIds.multipleChoice,
        currentText: null,
        selectedOptionId: options.first,
      },
      {
        attemptId: attemptIds.first,
        questionId: questionIds.shortAnswer,
        currentText: 'H02 short answer before offline edits.',
        selectedOptionId: null,
      },
      {
        attemptId: attemptIds.first,
        questionId: questionIds.essay,
        currentText: 'H02 essay before offline edits.',
        selectedOptionId: null,
      },
    ];
    for (const previous of baseline) {
      const saved = await database.response.create({
        data: {
          attemptId: previous.attemptId,
          questionId: previous.questionId,
          currentText: previous.currentText,
          selectedOptionId: previous.selectedOptionId,
          syncStatus: 'synced',
        },
      });
      await database.responseVersion.create({
        data: {
          responseId: saved.id,
          text: previous.currentText,
          selectedOptionId: previous.selectedOptionId,
          versionNum: 1,
          saveType: 'sync',
        },
      });
    }

    const firstOfflineEdit: SyncItem[] = [
      { questionId: questionIds.essay, currentText: 'H02 essay edit one.', selectedOptionId: null, wordCount: 4 },
      { questionId: questionIds.multipleChoice, currentText: null, selectedOptionId: options.second, wordCount: 0 },
      { questionId: questionIds.shortAnswer, currentText: 'H02 short answer edit one.', selectedOptionId: null, wordCount: 5 },
    ];
    const finalOfflineEdit: SyncItem[] = [
      { questionId: questionIds.shortAnswer, currentText: 'H02 short answer final — exact.', selectedOptionId: null, wordCount: 5 },
      { questionId: questionIds.multipleChoice, currentText: null, selectedOptionId: options.first, wordCount: 0 },
      { questionId: questionIds.essay, currentText: 'H02 essay final:\n“naïve Ω.”', selectedOptionId: null, wordCount: 4 },
    ];

    authState.candidateId = candidateOneId;
    const firstSync = await syncPost(syncRequest(attemptIds.first, firstOfflineEdit), {
      params: Promise.resolve({ id: attemptIds.first }),
    });
    expect(firstSync.status).toBe(200);

    const finalSync = await syncPost(syncRequest(attemptIds.first, finalOfflineEdit), {
      params: Promise.resolve({ id: attemptIds.first }),
    });
    expect(finalSync.status).toBe(200);

    const lostAcknowledgementRetry = await syncPost(syncRequest(attemptIds.first, finalOfflineEdit), {
      params: Promise.resolve({ id: attemptIds.first }),
    });
    expect(lostAcknowledgementRetry.status).toBe(200);

    authState.candidateId = candidateTwoId;
    const mismatchedOwner = await syncPost(syncRequest(attemptIds.first, finalOfflineEdit), {
      params: Promise.resolve({ id: attemptIds.first }),
    });
    expect(mismatchedOwner.status).toBe(403);

    const secondCandidateSync = await syncPost(syncRequest(attemptIds.second, finalOfflineEdit), {
      params: Promise.resolve({ id: attemptIds.second }),
    });
    expect(secondCandidateSync.status).toBe(200);

    const attemptRecords = await database.response.findMany({
      where: { attemptId: attemptIds.first },
      include: {
        versions: { orderBy: { versionNum: 'asc' } },
        attempt: { select: { candidateId: true, assessmentId: true } },
      },
      orderBy: { questionId: 'asc' },
    });
    expect(attemptRecords).toHaveLength(3);
    expect(attemptRecords.map((response) => response.questionId).sort()).toEqual(Object.values(questionIds).sort());

    const finalByQuestion = new Map(finalOfflineEdit.map((item) => [item.questionId, item]));
    for (const response of attemptRecords) {
      const expected = finalByQuestion.get(response.questionId);
      expect(expected).toBeDefined();
      expect(response.attemptId).toBe(attemptIds.first);
      expect(response.attempt.candidateId).toBe(candidateOneId);
      expect(response.attempt.assessmentId).toBe(assessmentId);
      expect(response.currentText).toBe(expected?.currentText);
      expect(response.selectedOptionId).toBe(expected?.selectedOptionId);
      const latestVersion = response.versions[response.versions.length - 1];
      expect(latestVersion?.versionNum).toBe(3);
      expect(latestVersion?.text).toBe(expected?.currentText);
      expect(latestVersion?.selectedOptionId).toBe(expected?.selectedOptionId);
      expect(response.versions.map((version) => version.versionNum)).toEqual([1, 2, 3]);
      expect(new Set(response.versions.map((version) => version.versionNum)).size).toBe(3);
    }

    const secondCandidateRecords = await database.response.findMany({
      where: { attemptId: attemptIds.second },
      include: { attempt: { select: { candidateId: true, assessmentId: true } } },
    });
    expect(secondCandidateRecords).toHaveLength(3);
    expect(secondCandidateRecords.every((response) => response.attemptId === attemptIds.second)).toBe(true);
    expect(secondCandidateRecords.every((response) => response.attempt.candidateId === candidateTwoId)).toBe(true);
    expect(secondCandidateRecords.every((response) => response.attempt.assessmentId === assessmentId)).toBe(true);
    expect(await database.attempt.count({ where: { candidateId: candidateOneId, assessmentId } })).toBe(1);

    console.info(
      `[H02] PASS: ${attemptRecords.length} current responses, 3 unique versions per answered question, ` +
        `and separate attempt ownership for both candidates.`,
    );
  });
});

if (!process.env.TEST_DATABASE_URL) {
  console.info('[H02] SKIP: run npm run test:database for the isolated PostgreSQL handler integration.');
}
