export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isCourseSemester } from '@/lib/course-semester';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/grading');
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const levelParam = params.get('level')?.trim() ?? '';
  const matricNumber = params.get('matricNumber')?.trim().slice(0, 64) ?? '';
  const semesterParam = params.get('semester')?.trim() ?? '';
  if (levelParam && !['100', '200', '300', '400', '500'].includes(levelParam)) {
    return NextResponse.json({ error: 'Level must be 100, 200, 300, 400, or 500.' }, { status: 400 });
  }
  if (semesterParam && semesterParam !== 'unassigned' && !isCourseSemester(semesterParam)) {
    return NextResponse.json({ error: 'Semester must be first, second, full_year, or unassigned.' }, { status: 400 });
  }
  const courseSemesterFilter = semesterParam
    ? { semester: semesterParam === 'unassigned' ? null : semesterParam }
    : undefined;

  const role = (session!.user as any).role;
  const where: any = {
    status: { in: ['submitted', 'auto_submitted_violation', 'timed_out'] },
  };

  const candidateFilter: Record<string, unknown> = {};
  if (levelParam) candidateFilter.academicLevel = Number(levelParam);
  if (matricNumber) {
    candidateFilter.matricNumber = { contains: matricNumber, mode: 'insensitive' };
  }
  if (Object.keys(candidateFilter).length > 0) where.candidate = candidateFilter;

  if (role === 'lecturer') {
    const courses = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'lecturer' },
      select: { courseId: true },
    });
    where.assessment = {
      courseId: { in: courses.map((c) => c.courseId) },
      ...(courseSemesterFilter ? { course: courseSemesterFilter } : {}),
    };
  } else if (courseSemesterFilter) {
    where.assessment = { course: courseSemesterFilter };
  }

  const attempts = await prisma.attempt.findMany({
    where,
    include: {
      candidate: { select: { id: true, name: true, email: true, matricNumber: true, academicLevel: true } },
      assessment: {
        include: {
          course: { select: { code: true, title: true, semester: true } },
          _count: { select: { items: true } },
        },
      },
      _count: { select: { gradeDecisions: true, responses: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });

  await createAuditEvent({
    actorId: session!.user.id,
    actionType: 'grading_queue_viewed',
    entityType: 'attempt',
    metadata: { count: attempts.length, semester: semesterParam || null },
  });

  return NextResponse.json(attempts);
}
