export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

const ALLOWED_DECISIONS = ['pending', 'accepted', 'modified', 'rejected', 'replaced'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attemptId: string; questionId: string }> }) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/grading/[attemptId]/[questionId]');
  if (error) return error;
  const { attemptId, questionId } = await params;

  try {
    const body = await request.json();
    const officialGrade = body?.officialGrade;
    const lecturerDecision = body?.lecturerDecision;
    const notes = body?.notes;
    const provisionalScore = body?.provisionalScore;

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { assessment: { include: { items: true } } },
    });
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });

    const item = attempt.assessment.items.find((it) => it.questionId === questionId);
    if (!item) return NextResponse.json({ error: 'Question is not part of this attempt' }, { status: 400 });

    const finalDecision = ALLOWED_DECISIONS.includes(lecturerDecision) ? lecturerDecision : 'pending';
    const requiresOfficialGrade = ['accepted', 'modified', 'replaced'].includes(finalDecision);
    const gradeWasProvided = officialGrade !== null && officialGrade !== undefined;

    if (finalDecision === 'pending' && gradeWasProvided) {
      return NextResponse.json({ error: 'A provisional grade cannot be saved as an official grade before lecturer review' }, { status: 400 });
    }
    if (finalDecision === 'rejected' && gradeWasProvided) {
      return NextResponse.json({ error: 'Rejected grades must not include an official grade' }, { status: 400 });
    }
    if (provisionalScore !== null && provisionalScore !== undefined) {
      const num = Number(provisionalScore);
      if (!Number.isFinite(num) || num < 0 || num > item.maxMark) {
        return NextResponse.json({ error: `Provisional score must be between 0 and ${item.maxMark}` }, { status: 400 });
      }
    }
    if (requiresOfficialGrade && !gradeWasProvided) {
      return NextResponse.json({ error: 'An official grade is required for this lecturer decision' }, { status: 400 });
    }

    let normalizedOfficialGrade: number | null = null;
    if (requiresOfficialGrade) {
      normalizedOfficialGrade = Number(officialGrade);
      if (!Number.isFinite(normalizedOfficialGrade) || normalizedOfficialGrade < 0 || normalizedOfficialGrade > item.maxMark) {
        return NextResponse.json({ error: `Official grade must be between 0 and ${item.maxMark}` }, { status: 400 });
      }
    }

    const gd = await prisma.gradeDecision.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: {
        officialGrade: normalizedOfficialGrade,
        lecturerDecision: finalDecision,
        notes: notes ?? (finalDecision === 'rejected' ? 'Returned for re-marking' : undefined),
        gradedBy: finalDecision === 'pending' ? null : session!.user.id,
        gradedAt: finalDecision === 'pending' ? null : new Date(),
      },
      create: {
        attemptId,
        questionId,
        officialGrade: normalizedOfficialGrade,
        lecturerDecision: finalDecision,
        notes: notes ?? (finalDecision === 'rejected' ? 'Returned for re-marking' : null),
        provisionalScore: provisionalScore ?? null,
        gradedBy: finalDecision === 'pending' ? null : session!.user.id,
        gradedAt: finalDecision === 'pending' ? null : new Date(),
      },
    });

    const allGrades = await prisma.gradeDecision.findMany({ where: { attemptId, officialGrade: { not: null } } });
    const totalSubjective = allGrades.reduce((sum: number, g: any) => sum + (g.officialGrade ?? 0), 0);

    const objectives = await prisma.objectiveOutcome.findMany({ where: { attemptId } });
    const totalObjective = objectives.reduce((sum: number, o: any) => sum + (o.score ?? 0), 0);

    await prisma.result.upsert({
      where: { attemptId },
      update: {
        totalSubjectiveScore: totalSubjective,
        totalObjectiveScore: totalObjective,
        totalScore: totalObjective + totalSubjective,
        status: finalDecision === 'pending' || finalDecision === 'rejected' ? 'pending' : 'graded',
      },
      create: {
        attemptId,
        totalSubjectiveScore: totalSubjective,
        totalObjectiveScore: totalObjective,
        totalScore: totalObjective + totalSubjective,
        status: finalDecision === 'pending' || finalDecision === 'rejected' ? 'pending' : 'graded',
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'grade_entered',
      entityType: 'grade_decision',
      entityId: gd.id,
      metadata: { attemptId, questionId, officialGrade: normalizedOfficialGrade, lecturerDecision: finalDecision, outcome: 'allowed' },
    });

    return NextResponse.json(gd);
  } catch (err: any) {
    console.error('Grade error:', err);
    return NextResponse.json({ error: 'Failed to save grade' }, { status: 500 });
  }
}
