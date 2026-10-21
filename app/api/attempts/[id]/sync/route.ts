export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { validateAttemptSession } from '@/lib/session-integrity';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/sync');
  if (error) return error;
  const { id } = await params;

  try {
    const attempt = await prisma.attempt.findUnique({ where: { id } });
    if (!attempt || attempt.candidateId !== session!.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sessionCheck = await validateAttemptSession(id, request.cookies.get(`exam_session_${id}`)?.value ?? null);
    if (!sessionCheck.ok) return NextResponse.json({ code: sessionCheck.code, error: sessionCheck.error }, { status: 409 });

    const { responses } = await request.json();
    if (!Array.isArray(responses)) {
      return NextResponse.json({ error: 'Invalid responses' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `response-sync:${id}`;
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        )
        SELECT TRUE AS locked FROM lock_result
      `;

      const lockedAttempt = await tx.attempt.findUnique({
        where: { id },
        include: { assessment: { include: { items: true } } },
      });
      if (!lockedAttempt || lockedAttempt.candidateId !== session!.user.id) {
        return { kind: 'forbidden' as const };
      }

      const now = new Date();
      if (lockedAttempt.expiresAt && now >= lockedAttempt.expiresAt) {
        await tx.attempt.update({ where: { id }, data: { status: 'timed_out', isActive: false } });
        return { kind: 'expired' as const };
      }
      if (lockedAttempt.status !== 'in_progress' || !lockedAttempt.isActive) {
        return { kind: 'inactive' as const };
      }

      const allowedQuestionIds = new Set(lockedAttempt.assessment.items.map((item) => item.questionId));
      if (responses.some((response) => !allowedQuestionIds.has(response.questionId))) {
        return { kind: 'invalid_question' as const };
      }

      const savedResponses = [];
      for (const resp of responses) {
        const { questionId, currentText, selectedOptionId, wordCount, timeSpentSecs, visitCount, answerChanges } = resp;
        const responseKey = { attemptId_questionId: { attemptId: id, questionId } };
        const existing = await tx.response.findUnique({ where: responseKey });
        const isStale = existing
          && typeof answerChanges === 'number'
          && existing.answerChanges > answerChanges;
        if (isStale) {
          savedResponses.push(existing);
          continue;
        }

        const saved = await tx.response.upsert({
          where: responseKey,
          update: {
            currentText: currentText === undefined ? undefined : currentText,
            selectedOptionId: selectedOptionId === undefined ? undefined : selectedOptionId,
            wordCount: wordCount ?? undefined,
            syncStatus: 'synced',
            lastSyncedAt: now,
            timeSpentSecs: timeSpentSecs ?? undefined,
            visitCount: visitCount ?? undefined,
            answerChanges: answerChanges ?? undefined,
          },
          create: {
            attemptId: id,
            questionId,
            currentText: currentText ?? null,
            selectedOptionId: selectedOptionId ?? null,
            wordCount: wordCount ?? 0,
            syncStatus: 'synced',
            lastSyncedAt: now,
            timeSpentSecs: timeSpentSecs ?? 0,
            visitCount: visitCount ?? 0,
            answerChanges: answerChanges ?? 0,
          },
        });
        savedResponses.push(saved);

        const previous = await tx.responseVersion.findFirst({
          where: { responseId: saved.id },
          orderBy: { versionNum: 'desc' },
        });
        const versionText = currentText === undefined ? saved.currentText : currentText;
        const versionSelectedOptionId = selectedOptionId === undefined
          ? saved.selectedOptionId
          : selectedOptionId;
        const hasSavedValue = versionText !== null && versionText !== ''
          || versionSelectedOptionId !== null;
        if (
          (currentText !== undefined || selectedOptionId !== undefined)
          && (previous === null
            ? hasSavedValue
            : previous.text !== versionText || previous.selectedOptionId !== versionSelectedOptionId)
        ) {
          const versionCount = await tx.responseVersion.count({ where: { responseId: saved.id } });
          await tx.responseVersion.create({
            data: {
              responseId: saved.id,
              text: versionText,
              selectedOptionId: versionSelectedOptionId,
              wordCount: wordCount ?? saved.wordCount,
              versionNum: versionCount + 1,
              saveType: 'sync',
            },
          });
        }
      }
      return { kind: 'synced' as const, now, savedResponses };
    });

    if (result.kind === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (result.kind === 'expired') {
      await createAuditEvent({
        actorId: session!.user.id,
        actionType: 'attempt_timed_out',
        entityType: 'attempt',
        entityId: id,
      });
      return NextResponse.json({ error: 'Attempt has expired and is now closed' }, { status: 400 });
    }
    if (result.kind === 'inactive') {
      return NextResponse.json({ error: 'Attempt is not active' }, { status: 400 });
    }
    if (result.kind === 'invalid_question') {
      return NextResponse.json({ error: 'Question is not part of this attempt' }, { status: 400 });
    }

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'responses_synced',
      entityType: 'attempt',
      entityId: id,
      metadata: { responseCount: responses.length },
    });

    return NextResponse.json({
      status: 'synced',
      responses: result.savedResponses,
      syncedAt: result.now.toISOString(),
    });
  } catch (err: any) {
    console.error('Sync error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
