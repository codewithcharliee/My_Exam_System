export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isCourseSemester } from '@/lib/course-semester';

function gradeFromScore(score: number): string {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/reports');
  if (error) return error;

  try {
    const url = new URL(request.url);
    const reportType = url.searchParams.get('type') || 'summary';
    const courseIdFilter = url.searchParams.get('courseId') || undefined;
    const semesterFilter = url.searchParams.get('semester') || undefined;
    const role = (session!.user as any).role;

    const assessmentWhere: any = {};
    if (courseIdFilter) assessmentWhere.courseId = courseIdFilter;
    if (semesterFilter) {
      if (semesterFilter === 'unassigned') assessmentWhere.course = { semester: null };
      else if (isCourseSemester(semesterFilter)) assessmentWhere.course = { semester: semesterFilter };
      else return NextResponse.json({ error: 'Semester must be first, second, full_year, or unassigned.' }, { status: 400 });
    }

    if (role === 'lecturer') {
      const courses = await prisma.userCourse.findMany({
        where: { userId: session!.user.id, role: 'lecturer' },
        select: { courseId: true },
      });
      const lecturerCourseIds = courses.map((c: any) => c.courseId);
      assessmentWhere.courseId = courseIdFilter
        ? { in: lecturerCourseIds.filter((id: string) => id === courseIdFilter) }
        : { in: lecturerCourseIds };
    }

    const [totalAssessments, totalAttempts, submittedAttempts] = await Promise.all([
      prisma.assessment.count({ where: assessmentWhere }),
      prisma.attempt.count({ where: { assessment: assessmentWhere } }),
      prisma.attempt.count({ where: { assessment: assessmentWhere, status: { in: ['submitted', 'auto_submitted_violation', 'timed_out'] } } }),
    ]);

    const results = await prisma.result.findMany({
      where: { attempt: { assessment: assessmentWhere } },
      select: {
        totalScore: true,
        totalObjectiveScore: true,
        totalSubjectiveScore: true,
      },
    });

    const scores = results.map((r: any) => {
      if (r?.totalScore !== null && r?.totalScore !== undefined) return r.totalScore;
      return (r?.totalObjectiveScore ?? 0) + (r?.totalSubjectiveScore ?? 0);
    });

    const averageScore = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    const passRate = scores.length ? (scores.filter((s: number) => s >= 50).length / scores.length) * 100 : 0;

    const scoreDistribution = [
      { range: '0-20', count: scores.filter((s: number) => s >= 0 && s <= 20).length },
      { range: '21-40', count: scores.filter((s: number) => s > 20 && s <= 40).length },
      { range: '41-60', count: scores.filter((s: number) => s > 40 && s <= 60).length },
      { range: '61-80', count: scores.filter((s: number) => s > 60 && s <= 80).length },
      { range: '81-100', count: scores.filter((s: number) => s > 80).length },
    ];

    const gradeBuckets: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const score of scores) {
      gradeBuckets[gradeFromScore(score)] += 1;
    }
    const gradeBreakdown = Object.entries(gradeBuckets).map(([grade, count]) => ({ grade, count }));

    let assessments: any[] = [];
    if (reportType === 'detailed') {
      const list = await prisma.assessment.findMany({
        where: assessmentWhere,
        include: {
          course: { select: { code: true, title: true, semester: true } },
          attempts: {
            include: { results: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      assessments = list.map((a: any) => {
        const attemptScores = (a.attempts ?? []).flatMap((attempt: any) =>
          (attempt.results ?? []).map((r: any) => {
            if (r?.totalScore !== null && r?.totalScore !== undefined) return r.totalScore;
            return (r?.totalObjectiveScore ?? 0) + (r?.totalSubjectiveScore ?? 0);
          })
        );

        const avgScore = attemptScores.length
          ? attemptScores.reduce((sum: number, s: number) => sum + s, 0) / attemptScores.length
          : 0;
        const pass = attemptScores.filter((s: number) => s >= 50).length;
        const passRateAssessment = attemptScores.length ? (pass / attemptScores.length) * 100 : 0;

        return {
          id: a.id,
          title: a.title,
          courseCode: a.course?.code,
          semester: a.course?.semester,
          attemptCount: a.attempts?.length ?? 0,
          avgScore,
          passRate: passRateAssessment,
        };
      });
    }

    // Objective analytics (frequently missed, completion and time patterns)
    const objectiveOutcomes = await prisma.objectiveOutcome.findMany({
      where: { attempt: { assessment: assessmentWhere } },
      include: { attempt: { select: { assessmentId: true } } },
    });

    const objectiveByQuestion: Record<string, { total: number; correct: number; totalTime: number }> = {};
    for (const row of objectiveOutcomes) {
      if (!objectiveByQuestion[row.questionId]) {
        objectiveByQuestion[row.questionId] = { total: 0, correct: 0, totalTime: 0 };
      }
      objectiveByQuestion[row.questionId].total += 1;
      if (row.isCorrect) objectiveByQuestion[row.questionId].correct += 1;
      objectiveByQuestion[row.questionId].totalTime += row.timeSpentSecs ?? 0;
    }

    const objectiveAnalytics = Object.entries(objectiveByQuestion)
      .map(([questionId, v]) => ({
        questionId,
        attempts: v.total,
        correctRate: v.total ? (v.correct / v.total) * 100 : 0,
        averageTimeSecs: v.total ? v.totalTime / v.total : 0,
      }))
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 20);

    let institutional: any = null;
    if (reportType === 'institutional') {
      if (!['admin', 'exam_officer'].includes(role)) return NextResponse.json({ error: 'Institutional reports are restricted' }, { status: 403 });
      const [accountCounts, authenticationOutcomes, questionBankActivity, gradingWorkload, monitoringRecords, readinessChecks] = await Promise.all([
        prisma.user.groupBy({ by: ['role', 'accountStatus'], _count: { _all: true } }),
        prisma.auditEvent.groupBy({ by: ['actionType'], where: { actionType: { in: ['login_success', 'login_failed'] } }, _count: { _all: true } }),
        prisma.question.count(),
        prisma.gradeDecision.count({ where: { officialGrade: { not: null } } }),
        prisma.monitoringEvent.count({ where: { attempt: { assessment: assessmentWhere } } }),
        prisma.readinessCheck.count({ where: { checkType: 'readiness_summary' } }),
      ]);
      institutional = { accountCounts, authenticationOutcomes, questionBankActivity, gradingWorkload, monitoringRecords, readinessChecks, suppressedSmallGroups: true };
    }

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'reports_viewed',
      entityType: 'report',
      metadata: { reportType, courseIdFilter: courseIdFilter ?? null, semesterFilter: semesterFilter ?? null },
    });

    return NextResponse.json({
      summary: {
        totalAssessments,
        totalAttempts,
        submittedAttempts,
        averageScore,
        passRate,
      },
      // Legacy top-level keys kept for existing dashboard cards
      totalAssessments,
      totalAttempts,
      submittedAttempts,
      avgScore: averageScore,
      averageScore,
      totalUsers: await prisma.user.count(),
      totalCourses: await prisma.course.count(),
      totalQuestions: await prisma.question.count(),
      scoreDistribution,
      gradeBreakdown,
      assessments,
      objectiveAnalytics,
      institutional,
    });
  } catch (err: any) {
    console.error('Reports error:', err);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}
