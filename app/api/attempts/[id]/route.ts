export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { validateAttemptSession } from '@/lib/session-integrity';

function sanitizeAttemptForCandidate(attempt: any) {
  return {
    ...attempt,
    assessment: {
      ...attempt.assessment,
      items: (attempt.assessment?.items ?? []).map((item: any) => ({
        ...item,
        question: {
          id: item.question.id,
          type: item.question.type,
          text: item.question.text,
          topic: item.question.topic,
          difficulty: item.question.difficulty,
          options: (item.question.options ?? []).map((option: any) => ({
            id: option.id,
            text: option.text,
            sortOrder: option.sortOrder,
          })),
          markingSchemes: [],
          answerKeys: [],
        },
      })),
    },
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('GET /api/attempts/[id]');
  if (error) return error;
  const { id } = await params;

  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      candidate: { select: { id: true, name: true, email: true } },
      assessment: {
        include: {
          course: true,
          items: {
            include: {
              question: {
                include: {
                  options: { orderBy: { sortOrder: 'asc' } },
                  answerKeys: true,
                  markingSchemes: { include: { markingPoints: true } },
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          },
        },
      },
      presentationMappings: { orderBy: { displayPosition: 'asc' } },
      responses: true,
      objectiveOutcomes: true,
      gradeDecisions: true,
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }

  const role = (session!.user as any).role;
  const isOwner = attempt.candidateId === session!.user.id;
  const isPrivileged = ['admin', 'exam_officer', 'lecturer', 'invigilator'].includes(role);

  if (role === 'lecturer') {
    const assignment = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId: session!.user.id, courseId: attempt.assessment.courseId } },
      select: { id: true, role: true },
    });
    if (assignment?.role !== 'lecturer') {
      await createAuditEvent({
        actorId: session!.user.id,
        actionType: 'authorization_denied',
        entityType: 'attempt',
        entityId: id,
        metadata: { action: 'attempt_record_read', outcome: 'denied', reason: 'lecturer_not_assigned_to_course' },
      });
      return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }
  }

  if (!isOwner && !isPrivileged) {
    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'authorization_denied',
      entityType: 'attempt',
      entityId: id,
      metadata: { action: 'attempt_record_read', outcome: 'denied', reason: 'not_attempt_owner' },
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (attempt.status === 'in_progress' && attempt.expiresAt && new Date() > attempt.expiresAt) {
    await prisma.attempt.update({
      where: { id },
      data: { status: 'timed_out', isActive: false },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'attempt_timed_out',
      entityType: 'attempt',
      entityId: id,
      metadata: { source: 'attempt_get_guard' },
    });

    attempt.status = 'timed_out';
    attempt.isActive = false;
  }

  if (role === 'candidate' && isOwner && attempt.status === 'in_progress' && attempt.isActive) {
    const sessionCheck = await validateAttemptSession(
      id,
      request.cookies.get(`exam_session_${id}`)?.value ?? null,
    );
    if (!sessionCheck.ok) {
      return NextResponse.json(
        { code: sessionCheck.code, error: sessionCheck.error },
        { status: 409 },
      );
    }
  }

  if (role === 'candidate') {
    return NextResponse.json({
      ...sanitizeAttemptForCandidate(attempt),
      serverTime: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ...attempt, serverTime: new Date().toISOString() });
}
