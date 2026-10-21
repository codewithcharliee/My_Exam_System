import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import {
  ATTEMPT_SESSION_STALE_AFTER_MS,
  INTERRUPTED_SESSION_REQUIRES_STAFF_CODE,
  hashSessionToken,
} from '@/lib/session-integrity';

type ExitResponse = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount?: number;
  timeSpentSecs?: number;
  visitCount?: number;
  answerChanges?: number;
};

function isExitResponse(value: unknown): value is ExitResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  if (
    typeof response.questionId !== 'string'
    || (response.currentText !== null && typeof response.currentText !== 'string')
    || (response.selectedOptionId !== null && typeof response.selectedOptionId !== 'string')
  ) return false;

  return ['wordCount', 'timeSpentSecs', 'visitCount', 'answerChanges'].every((key) => {
    const count = response[key];
    return count === undefined || (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0);
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/exit');
  if (error) return error;
  const { id } = await params;

  try {
    const token = request.cookies.get(`exam_session_${id}`)?.value;

    const bodyText = await request.text();
    let responses: unknown[] = [];
    if (bodyText) {
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return NextResponse.json({ error: 'Invalid final response payload.' }, { status: 400 });
      }
      if (
        !body
        || typeof body !== 'object'
        || !Array.isArray((body as { responses?: unknown }).responses)
      ) {
        return NextResponse.json({ error: 'Invalid final response payload.' }, { status: 400 });
      }
      responses = (body as { responses: unknown[] }).responses;
    }
    if (!responses.every(isExitResponse)) {
      return NextResponse.json({ error: 'Final responses contain invalid data.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id, candidateId: session!.user.id },
        include: {
          assessment: {
            include: {
              items: {
                include: {
                  question: {
                    select: { options: { select: { id: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!attempt) return { kind: 'error' as const, error: 'Attempt not found.', statusCode: 404 as const };
      if (attempt.status !== 'in_progress' || !attempt.isActive) {
        return { kind: 'already-ended' as const, status: attempt.status };
      }

      const activeSession = token ? await tx.attemptSession.findFirst({
        where: {
          attemptId: id,
          sessionTokenHash: hashSessionToken(token),
          supersededAt: null,
          endedAt: null,
        },
      }) : null;
      if (!activeSession) {
        const latestSession = await tx.attemptSession.findFirst({
          where: { attemptId: id, supersededAt: null, endedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { lastSeenAt: true },
        });
        if (!latestSession || Date.now() - latestSession.lastSeenAt.getTime() > ATTEMPT_SESSION_STALE_AFTER_MS) {
          return {
            kind: 'error' as const,
            code: INTERRUPTED_SESSION_REQUIRES_STAFF_CODE,
            error: 'This interrupted attempt is locked. Authorized personnel must reactivate it before you can continue.',
            statusCode: 409 as const,
          };
        }
      }

      const itemsByQuestionId = new Map(attempt.assessment.items.map((item) => [item.questionId, item]));
      for (const response of responses) {
        const item = itemsByQuestionId.get(response.questionId);
        if (
          !item
          || (response.selectedOptionId !== null
            && !item.question.options.some((option) => option.id === response.selectedOptionId))
        ) {
          return {
            kind: 'error' as const,
            error: 'Final responses contain a question or answer that is not part of this exam.',
            statusCode: 400 as const,
          };
        }
      }

      const now = new Date();
      if (activeSession) {
        await tx.attemptSession.update({
          where: { id: activeSession.id },
          data: { lastSeenAt: now },
        });
      }
      for (const response of responses) {
        const saved = await tx.response.upsert({
          where: { attemptId_questionId: { attemptId: id, questionId: response.questionId } },
          update: {
            currentText: response.currentText,
            selectedOptionId: response.selectedOptionId,
            wordCount: response.wordCount,
            timeSpentSecs: response.timeSpentSecs,
            visitCount: response.visitCount,
            answerChanges: response.answerChanges,
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
          create: {
            attemptId: id,
            questionId: response.questionId,
            currentText: response.currentText,
            selectedOptionId: response.selectedOptionId,
            wordCount: response.wordCount ?? 0,
            timeSpentSecs: response.timeSpentSecs ?? 0,
            visitCount: response.visitCount ?? 0,
            answerChanges: response.answerChanges ?? 0,
            syncStatus: 'synced',
            lastSyncedAt: now,
          },
        });

        if (response.currentText !== null || response.selectedOptionId !== null) {
          const previousVersion = await tx.responseVersion.findFirst({
            where: { responseId: saved.id },
            orderBy: { versionNum: 'desc' },
            select: { text: true, selectedOptionId: true, versionNum: true },
          });
          if (
            !previousVersion
            || previousVersion.text !== response.currentText
            || previousVersion.selectedOptionId !== response.selectedOptionId
          ) {
            await tx.responseVersion.create({
              data: {
                responseId: saved.id,
                text: response.currentText,
                selectedOptionId: response.selectedOptionId,
                wordCount: response.wordCount ?? saved.wordCount,
                versionNum: (previousVersion?.versionNum ?? 0) + 1,
                saveType: 'submit',
              },
            });
          }
        }
      }

      const timedOut = !!attempt.expiresAt && attempt.expiresAt <= now;
      await tx.attempt.update({
        where: { id },
        data: {
          status: timedOut ? 'timed_out' : 'abandoned',
          isActive: false,
        },
      });
      await tx.attemptSession.updateMany({
        where: { attemptId: id, supersededAt: null, endedAt: null },
        data: { endedAt: now },
      });
      return {
        kind: 'ended' as const,
        status: timedOut ? 'timed_out' : 'abandoned',
        actorId: session!.user.id,
      };
    });

    if (result.kind === 'error') {
      return NextResponse.json(
        { code: 'code' in result ? result.code : undefined, error: result.error },
        { status: result.statusCode },
      );
    }
    if (result.kind === 'ended') {
      await createAuditEvent({
        actorId: result.actorId,
        actionType: 'attempt_abandoned',
        entityType: 'attempt',
        entityId: id,
        reason: 'Candidate intentionally left the active examination',
        metadata: { savedResponseCount: responses.length, status: result.status },
      });
    }
    return NextResponse.json({ ended: true, status: result.status });
  } catch (exitError) {
    console.error('Exam exit handling failed:', exitError);
    return NextResponse.json({ error: 'Unable to save and end the active exam session.' }, { status: 500 });
  }
}
