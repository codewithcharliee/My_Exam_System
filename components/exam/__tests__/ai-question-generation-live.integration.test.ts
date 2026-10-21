import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

dotenv.config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const userId = `live-ai-lecturer-${randomUUID()}`;
const courseId = `live-ai-course-${randomUUID()}`;
const syntheticMaterialSeed = 'Synthetic constitutional law source: public authority is allocated among branches, and each branch operates within legal limits. ';
const syntheticCourseMaterial = syntheticMaterialSeed.repeat(Math.ceil(60_000 / syntheticMaterialSeed.length)).slice(0, 60_000);
const configured = process.env.RUN_LIVE_AI_GENERATION === '1'
  && Boolean((process.env.ABACUSAI_API_KEY ?? '').trim());

vi.mock('@/lib/roles', () => ({
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: userId, role: 'lecturer' } },
  })),
}));

import { POST as generateQuestions } from '@/app/api/ai/generate-questions/route';
import { prisma } from '@/lib/prisma';

const liveDescribe = configured ? describe : describe.skip;

liveDescribe('Live AI question generation with isolated PostgreSQL', () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: 'Synthetic Live AI Lecturer',
        email: `${userId}@example.test`,
        passwordHash: 'unused-live-test-password-hash',
        role: 'lecturer',
      },
    });
    await prisma.course.create({
      data: { id: courseId, code: `LIVE-${randomUUID()}`, title: 'Synthetic Constitutional Law' },
    });
    await prisma.userCourse.create({
      data: { userId, courseId, role: 'lecturer' },
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
    await prisma.aiRequest.deleteMany({ where: { actorId: userId } });
    await prisma.question.deleteMany({ where: { createdBy: userId } });
    await prisma.userCourse.deleteMany({ where: { userId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('generates 25 valid draft questions from larger material and persists answer keys', async () => {
    const response = await generateQuestions(new Request('http://localhost/api/ai/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        topic: 'Separation of powers',
        questionType: 'multiple_choice',
        difficulty: 'medium',
        count: 25,
        courseMaterial: syntheticCourseMaterial,
      }),
    }) as never);
    const output = await response.text();
    const completedLine = output.split('\n').find((line) => line.startsWith('data: {"status":"completed"'));
    expect(completedLine, output.slice(-1000)).toBeTruthy();

    const completed = JSON.parse(completedLine!.slice(6)) as { result: { draftIds: string[] } };
    expect(completed.result.draftIds).toHaveLength(25);

    const drafts = await prisma.question.findMany({
      where: { id: { in: completed.result.draftIds } },
      include: { options: true, answerKeys: true },
    });
    expect(drafts).toHaveLength(25);
    expect(drafts.every((draft) => draft.status === 'draft'
      && draft.type === 'multiple_choice'
      && draft.options.length === 4
      && draft.options.filter((option) => option.isCorrect).length === 1
      && draft.answerKeys.length === 1
      && draft.answerKeys[0].correctOptionId === draft.options.find((option) => option.isCorrect)?.id)).toBe(true);
    expect(await prisma.aiRequest.count({ where: { actorId: userId, requestType: 'question_generation' } })).toBe(1);
    expect(await prisma.assessmentItem.count({ where: { questionId: { in: completed.result.draftIds } } })).toBe(0);
  }, 120_000);
});