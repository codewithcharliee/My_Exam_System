export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { maskCandidateIdentifier } from '@/lib/exam-receipt';
import { autoScoreSubjective, scoreObjectiveAnswer } from '@/lib/scoring';
import { validateAttemptSession } from '@/lib/session-integrity';
import { createSubmissionReceipt } from '@/lib/exam-receipt';

type FinalResponse = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount?: number;
  timeSpentSecs?: number;
  visitCount?: number;
  answerChanges?: number;
};

function isFinalResponse(value: unknown): value is FinalResponse {
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
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/submit');
  if (error) return error;
  const { id } = await params;

  try {
    const bodyText = await request.text();
    let finalResponses: unknown[] = [];
    let submissionReason: 'candidate' | 'AUTO_SUBMITTED_VIOLATION' = 'candidate';
    let violationCount: number | null = null;
    let violationType: string | null = null;
    if (bodyText) {
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return NextResponse.json({ error: 'Invalid final response payload' }, { status: 400 });
      }
      if (!body || typeof body !== 'object' || !Array.isArray((body as { responses?: unknown }).responses)) {
        return NextResponse.json({ error: 'Invalid final response payload' }, { status: 400 });
      }
      const reason = (body as { reason?: unknown }).reason;
      if (reason !== undefined && reason !== 'AUTO_SUBMITTED_VIOLATION') {
        return NextResponse.json({ error: 'Invalid submission reason' }, { status: 400 });
      }
      if (reason === 'AUTO_SUBMITTED_VIOLATION') submissionReason = reason;
      const requestedViolationCount = (body as { violationCount?: unknown }).violationCount;
      if (submissionReason === 'AUTO_SUBMITTED_VIOLATION') {
        if (
          typeof requestedViolationCount !== 'number'
          || !Number.isSafeInteger(requestedViolationCount)
          || requestedViolationCount < 1
        ) {
          return NextResponse.json({ error: 'A valid violation count is required for automatic submission' }, { status: 400 });
        }
        violationCount = requestedViolationCount;
        const requestedViolationType = (body as { violationType?: unknown }).violationType;
        if (
          requestedViolationType !== undefined
          && (typeof requestedViolationType !== 'string' || requestedViolationType.length > 100)
        ) {
          return NextResponse.json({ error: 'Invalid violation type' }, { status: 400 });
        }
        violationType = typeof requestedViolationType === 'string' ? requestedViolationType : null;
      }
      finalResponses = (body as { responses: unknown[] }).responses;
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id },
      include: {
        assessment: { include: { items: { include: { question: { include: { answerKeys: true, options: true, markingSchemes: { include: { markingPoints: true } } } } } } } },
        responses: true,
      },
    });

    if (!attempt || attempt.candidateId !== session!.user.id) {
      await createAuditEvent({
        actorId: session!.user.id,
        actionType: 'authorization_denied',
        entityType: 'attempt',
        entityId: id,
        metadata: { action: 'attempt_submit', outcome: 'denied', reason: 'not_attempt_owner' },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sessionCheck = await validateAttemptSession(id, request.cookies.get(`exam_session_${id}`)?.value ?? null);
    if (!sessionCheck.ok) return NextResponse.json({ code: sessionCheck.code, error: sessionCheck.error }, { status: 409 });
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'Attempt already submitted' }, { status: 400 });
    }

    const now = new Date();
    if (attempt.expiresAt && now > attempt.expiresAt) {
      await prisma.attempt.update({
        where: { id },
        data: { status: 'timed_out', isActive: false },
      });
      await createAuditEvent({
        actorId: session!.user.id,
        actionType: 'attempt_timed_out',
        entityType: 'attempt',
        entityId: id,
        metadata: { outcome: 'locked_without_late_responses' },
      });
      return NextResponse.json({ attemptId: id, status: 'timed_out' });
    }

    if (finalResponses.length > 0) {
      const itemsByQuestionId = new Map(attempt.assessment.items.map((item) => [item.questionId, item]));
      const responsePayloadIsValid = finalResponses.every((response): response is FinalResponse => {
        if (!isFinalResponse(response)) return false;
        const item = itemsByQuestionId.get(response.questionId);
        if (!item) return false;
        if (
          typeof response.selectedOptionId === 'string'
          && !item.question.options.some((option) => option.id === response.selectedOptionId)
        ) return false;
        return true;
      });
      if (!responsePayloadIsValid) {
        return NextResponse.json({ error: 'Final responses contain invalid or unrelated answers' }, { status: 400 });
      }

      const savedAt = new Date();
      for (const response of finalResponses) {
        if (!isFinalResponse(response)) continue;
        await prisma.response.upsert({
          where: { attemptId_questionId: { attemptId: id, questionId: response.questionId } },
          update: {
            currentText: response.currentText,
            selectedOptionId: response.selectedOptionId,
            wordCount: response.wordCount,
            timeSpentSecs: response.timeSpentSecs,
            visitCount: response.visitCount,
            answerChanges: response.answerChanges,
            syncStatus: 'synced',
            lastSyncedAt: savedAt,
          },
          create: {
            attemptId: id,
            questionId: response.questionId,
            currentText: response.currentText,
            selectedOptionId: response.selectedOptionId,
            wordCount: response.wordCount,
            timeSpentSecs: response.timeSpentSecs,
            visitCount: response.visitCount,
            answerChanges: response.answerChanges,
            syncStatus: 'synced',
            lastSyncedAt: savedAt,
          },
        });
      }
      attempt.responses = await prisma.response.findMany({ where: { attemptId: id } });
    }

    const receipt = createSubmissionReceipt(attempt.assessmentId, attempt.id, session!.user.id, now);

    let hasSubjectivePending = false;

    for (const item of attempt.assessment.items) {
      if (item.question.type === 'multiple_choice') {
        const response = attempt.responses.find((r: any) => r.questionId === item.questionId);
        const answerKey = item.question.answerKeys?.[0];

        const selectedOptionId = response?.selectedOptionId ?? null;
        const { isCorrect, score, isUnanswered } = scoreObjectiveAnswer(
          selectedOptionId,
          answerKey?.correctOptionId,
          item.maxMark,
        );

        await prisma.objectiveOutcome.upsert({
          where: { attemptId_questionId: { attemptId: id, questionId: item.questionId } },
          update: {
            selectedOptionId,
            isCorrect,
            score,
            isUnanswered,
            timeSpentSecs: response?.timeSpentSecs ?? 0,
            visitCount: response?.visitCount ?? 0,
            answerChanges: response?.answerChanges ?? 0,
          },
          create: {
            attemptId: id,
            questionId: item.questionId,
            selectedOptionId,
            isCorrect,
            score,
            maxMark: item.maxMark,
            timeSpentSecs: response?.timeSpentSecs ?? 0,
            visitCount: response?.visitCount ?? 0,
            answerChanges: response?.answerChanges ?? 0,
            isUnanswered,
          },
        });
      } else {
        const response = attempt.responses.find((r: any) => r.questionId === item.questionId);
        const answerText = response?.currentText ?? '';
        const scheme = (item.question.markingSchemes ?? [])
          .slice()
          .sort((a: any, b: any) => (a.version ?? 0) - (b.version ?? 0))
          .pop() ?? null;

        let provisionalScore: number | null = null;
        const aiRecJson: string | null = null;
        let derivedMethod: any = item.markingMethod ?? 'human_grading';
        let notes: string | null = null;

        const canAutoScore = item.question.type === 'short_answer'
          && !!scheme
          && scheme.method !== 'ai_recommendation';

        if (scheme?.method === 'ai_recommendation') {
          derivedMethod = 'ai_recommendation';
          notes = 'AI recommendation is available for lecturer review after submission; no AI score has been generated yet.';
          hasSubjectivePending = true;
        } else if (canAutoScore && scheme) {
          const result = autoScoreSubjective(answerText, {
            method: scheme.method,
            maxMark: item.maxMark,
            configJson: scheme.configJson,
            markingPoints: (scheme.markingPoints ?? []).map((p: any) => ({
              pointText: p.pointText,
              marks: p.marks,
              alternativesJson: p.alternativesJson,
            })),
          });

          provisionalScore = result.provisionalScore ?? null;
          derivedMethod = scheme.method;
          hasSubjectivePending = true;

          notes = answerText
            ? `Provisional score generated on submission using ${scheme.method}. Lecturer confirmation required.`
            : 'No response submitted. Lecturer review required.';
        } else {
          provisionalScore = null;
          derivedMethod = 'human_grading';
          notes = 'Human grading required for this question type.';
          hasSubjectivePending = true;
        }

        await prisma.gradeDecision.upsert({
          where: { attemptId_questionId: { attemptId: id, questionId: item.questionId } },
          update: {
            provisionalScore,
            aiRecommendationJson: aiRecJson,
            method: derivedMethod,
            notes,
          },
          create: {
            attemptId: id,
            questionId: item.questionId,
            method: derivedMethod,
            provisionalScore,
            officialGrade: null,
            lecturerDecision: 'pending',
            aiRecommendationJson: aiRecJson,
            notes,
          },
        });
      }
    }

    const outcomes = await prisma.objectiveOutcome.findMany({ where: { attemptId: id } });
    const totalObjective = outcomes.reduce((sum: number, o: any) => sum + (o.score ?? 0), 0);

    await prisma.attempt.update({
      where: { id },
      data: {
        status: submissionReason === 'AUTO_SUBMITTED_VIOLATION' ? 'auto_submitted_violation' : 'submitted',
        isActive: false,
        submittedAt: now,
        submissionReceipt: receipt,
        receiptAt: now,
      },
    });

    const activeSession = await prisma.attemptSession.findFirst({ where: { attemptId: id, endedAt: null } });
    if (activeSession) {
      await prisma.attemptSession.update({ where: { id: activeSession.id }, data: { endedAt: now } });
    }

    await prisma.result.upsert({
      where: { attemptId: id },
      update: {
        totalObjectiveScore: totalObjective,
        totalScore: totalObjective,
        status: hasSubjectivePending ? 'pending' : 'graded',
      },
      create: {
        attemptId: id,
        totalObjectiveScore: totalObjective,
        totalScore: totalObjective,
        status: hasSubjectivePending ? 'pending' : 'graded',
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: submissionReason === 'AUTO_SUBMITTED_VIOLATION'
        ? 'attempt_auto_submitted_violation'
        : 'attempt_submitted',
      entityType: 'attempt',
      entityId: id,
      metadata: {
        receipt,
        objectiveScore: totalObjective,
        hasSubjectivePending,
        submissionReason,
        violationCount,
        violationType,
      },
    });

    return NextResponse.json({
      receipt,
      receiptId: receipt,
      attemptId: attempt.id,
      candidateIdentifier: maskCandidateIdentifier(session!.user.id),
      status: submissionReason === 'AUTO_SUBMITTED_VIOLATION'
        ? 'AUTO_SUBMITTED_VIOLATION'
        : 'submitted',
      submittedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('Submit error:', err);
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
