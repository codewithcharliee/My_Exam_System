export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { shuffleArray } from '@/lib/exam-randomization';
import {
  createSessionToken,
  DUPLICATE_ACTIVE_SESSION_CODE,
  DUPLICATE_ACTIVE_SESSION_MESSAGE,
  hashSessionToken,
  validateAttemptSession,
} from '@/lib/session-integrity';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/start');
  if (error) return error;

  try {
    const { assessmentId } = await request.json();
    const userId = session!.user.id;

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        course: true,
        items: {
          include: { question: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!assessment || assessment.status !== 'published') {
      return NextResponse.json({ error: 'Assessment not available' }, { status: 400 });
    }

    const enrolled = await prisma.userCourse.findFirst({
      where: { userId, courseId: assessment.courseId, role: 'candidate' },
      select: { id: true },
    });
    if (!enrolled) {
      return NextResponse.json({ error: 'You are not enrolled for this course assessment.' }, { status: 403 });
    }

    const readinessSummary = await prisma.readinessCheck.findFirst({
      where: { candidateId: userId, checkType: 'readiness_summary' },
      orderBy: { checkedAt: 'desc' },
    });
    if (!readinessSummary) {
      return NextResponse.json({ error: 'Readiness check is required before starting this assessment.' }, { status: 400 });
    }

    try {
      const details = readinessSummary.detailsJson ? JSON.parse(readinessSummary.detailsJson) : null;
      if (!details || details.failedCount > 0 || details.blocked) {
        return NextResponse.json({ error: 'Readiness checks are incomplete or failed. Please complete readiness check first.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Readiness check data is invalid. Re-run readiness checks.' }, { status: 400 });
    }

    const now = new Date();
    if (assessment.startAt && now < assessment.startAt) {
      return NextResponse.json({ error: 'Assessment has not started yet' }, { status: 400 });
    }
    if (assessment.endAt && now > assessment.endAt) {
      return NextResponse.json({ error: 'Assessment has ended' }, { status: 400 });
    }

    const timeAdj = await prisma.timeAdjustment.findFirst({
      where: { candidateId: userId, assessmentId },
      orderBy: { approvedAt: 'desc' },
    });
    const extraMins = timeAdj?.extraMinutes ?? 0;
    const totalDuration = assessment.durationMins + extraMins;

    const expiresAt = new Date(now.getTime() + totalDuration * 60 * 1000);
    const sessionToken = createSessionToken();
    const startResult = await prisma.$transaction(async (tx) => {
      const lockKey = `exam-start:${userId}`;
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        )
        SELECT TRUE AS locked FROM lock_result
      `;

      await tx.attempt.updateMany({
        where: {
          candidateId: userId,
          isActive: true,
          status: 'in_progress',
          expiresAt: { lte: now },
        },
        data: { status: 'timed_out', isActive: false },
      });

      const activeAttempt = await tx.attempt.findFirst({
        where: { candidateId: userId, isActive: true },
      });
      if (activeAttempt) return { kind: 'active' as const, attempt: activeAttempt };

      const attemptCount = await tx.attempt.count({
        where: {
          candidateId: userId,
          assessmentId,
          status: { in: ['submitted', 'auto_submitted_violation', 'timed_out', 'abandoned'] },
        },
      });
      if (attemptCount >= assessment.maxAttempts) return { kind: 'maximum' as const };

      const attempt = await tx.attempt.create({
        data: {
          candidateId: userId,
          assessmentId,
          startAt: now,
          expiresAt,
          status: 'in_progress',
          isActive: true,
        },
      });

      await tx.attemptSession.create({
        data: {
          attemptId: attempt.id,
          sessionTokenHash: hashSessionToken(sessionToken),
          userAgent: request.headers.get('user-agent'),
        },
      });

      return { kind: 'created' as const, attempt };
    });

    if (startResult.kind === 'active') {
      const sessionCheck = await validateAttemptSession(
        startResult.attempt.id,
        request.cookies.get(`exam_session_${startResult.attempt.id}`)?.value ?? null,
      );
      if (sessionCheck.ok) {
        return NextResponse.json(
          {
            code: 'ACTIVE_EXAM_SESSION',
            error: 'Resuming your active exam session',
            attemptId: startResult.attempt.id,
            assessmentId: startResult.attempt.assessmentId,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          code: DUPLICATE_ACTIVE_SESSION_CODE,
          error: DUPLICATE_ACTIVE_SESSION_MESSAGE,
          attemptId: startResult.attempt.id,
        },
        { status: 409 },
      );
    }

    if (startResult.kind === 'maximum') {
      return NextResponse.json({ error: 'Maximum attempts reached' }, { status: 400 });
    }

    const attempt = startResult.attempt;
    let items = [...assessment.items];
    if (assessment.randomizeQuestions) {
      items = shuffleArray(items);
    }

    const mappingsMeta: Array<{ questionId: string; displayPosition: number; optionOrder: string[] | null }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let optionOrder: string[] | null = null;
      if (assessment.randomizeOptions && item.question.options?.length > 0) {
        optionOrder = shuffleArray(item.question.options.map((o: any) => o.id));
      }

      await prisma.presentationMapping.create({
        data: {
          attemptId: attempt.id,
          questionId: item.questionId,
          displayPosition: i + 1,
          optionOrderJson: optionOrder ? JSON.stringify(optionOrder) : null,
        },
      });

      mappingsMeta.push({ questionId: item.questionId, displayPosition: i + 1, optionOrder });

      await prisma.response.create({
        data: {
          attemptId: attempt.id,
          questionId: item.questionId,
          syncStatus: 'synced',
        },
      });
    }

    await createAuditEvent({
      actorId: userId,
      actionType: 'attempt_started',
      entityType: 'attempt',
      entityId: attempt.id,
      metadata: {
        assessmentId,
        questionRandomized: assessment.randomizeQuestions,
        optionRandomized: assessment.randomizeOptions,
        presentationMappings: mappingsMeta,
      },
    });

    const response = NextResponse.json({ attemptId: attempt.id, expiresAt: attempt.expiresAt }, { status: 201 });
    response.cookies.set(`exam_session_${attempt.id}`, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: totalDuration * 60,
      path: '/',
    });
    return response;
  } catch (err: any) {
    console.error('Start attempt error:', err);
    return NextResponse.json({ error: 'Failed to start attempt' }, { status: 500 });
  }
}
