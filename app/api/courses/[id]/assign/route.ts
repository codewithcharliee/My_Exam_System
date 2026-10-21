export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

async function authorizeCourseAssignment(courseId: string, actorId: string, actorRole: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { error: NextResponse.json({ error: 'Course not found' }, { status: 404 }) };
  if (actorRole === 'lecturer') {
    const ownership = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId: actorId, courseId } },
      select: { id: true, role: true },
    });
    if (ownership?.role !== 'lecturer') {
      return { error: NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 }) };
    }
  }
  return { error: null };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/courses/[id]/assign');
  if (error) return error;
  const { id } = await params;

  try {
    const { userId, role } = await request.json();
    if (typeof userId !== 'string' || !userId || !['candidate', 'lecturer'].includes(role)) {
      return NextResponse.json({ error: 'A valid user and course role are required.' }, { status: 400 });
    }
    if (role === 'lecturer' && session!.user.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can assign lecturers.' }, { status: 403 });
    }
    const courseAccess = await authorizeCourseAssignment(id, session!.user.id, session!.user.role);
    if (courseAccess.error) return courseAccess.error;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target || target.role !== role) {
      return NextResponse.json({ error: 'The selected account does not match the requested course role.' }, { status: 400 });
    }
    const uc = await prisma.userCourse.upsert({
      where: { userId_courseId: { userId, courseId: id } },
      update: { role },
      create: { userId, courseId: id, role },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'course_assignment',
      entityType: 'user_course',
      entityId: uc.id,
      metadata: { userId, courseId: id, role },
    });

    return NextResponse.json(uc);
  } catch (err: any) {
    return NextResponse.json({ error: 'Assignment failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('DELETE /api/courses/[id]/assign');
  if (error) return error;
  const { id } = await params;

  try {
    const { userId, role = 'candidate' } = await request.json();
    if (typeof userId !== 'string' || !userId || !['candidate', 'lecturer'].includes(role)) {
      return NextResponse.json({ error: 'A valid user and course role are required.' }, { status: 400 });
    }
    if (role === 'lecturer' && session!.user.role !== 'admin') {
      return NextResponse.json({ error: 'Only administrators can remove lecturer assignments.' }, { status: 403 });
    }
    const courseAccess = await authorizeCourseAssignment(id, session!.user.id, session!.user.role);
    if (courseAccess.error) return courseAccess.error;
    const assignment = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId: id } },
      select: { id: true, role: true },
    });
    if (!assignment || assignment.role !== role) {
      return NextResponse.json({ error: 'Course assignment not found.' }, { status: 404 });
    }
    await prisma.userCourse.delete({ where: { id: assignment.id } });
    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'course_unassigned',
      entityType: 'user_course',
      entityId: assignment.id,
      metadata: { userId, courseId: id, role },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unassignment failed' }, { status: 500 });
  }
}
