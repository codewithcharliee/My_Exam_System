export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
const categories = new Set(['webcam_interruption', 'synchronization_delay', 'interface_freeze', 'other']);

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/issue-reports');
  if (error) return error;
  try {
    const body = await request.json();
    const category = String(body.category ?? 'other');
    if (!categories.has(category)) return NextResponse.json({ error: 'Invalid issue category' }, { status: 400 });
    const attempt = await prisma.attempt.findFirst({ where: { id: body.attemptId, candidateId: session!.user.id, status: 'in_progress', isActive: true } });
    if (!attempt) return NextResponse.json({ error: 'Active attempt not found' }, { status: 404 });
    const issue = await prisma.issueReport.create({ data: { attemptId: attempt.id, candidateId: session!.user.id, category, description: body.description ? String(body.description).slice(0, 500) : null, telemetryJson: body.telemetry ? JSON.stringify(body.telemetry) : null } });
    await createAuditEvent({ actorId: session!.user.id, actionType: 'issue_report_created', entityType: 'issue_report', entityId: issue.id, metadata: { attemptId: attempt.id, category } });
    return NextResponse.json({ issue }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not create issue report' }, { status: 500 });
  }
}

export async function GET() {
  const { error, session } = await requireRouteAuthorization('GET /api/issue-reports');
  if (error) return error;
  const issues = await prisma.issueReport.findMany({ include: { candidate: { select: { id: true, name: true, matricNumber: true } }, attempt: { select: { id: true, assessment: { select: { title: true } } } }, acknowledger: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return NextResponse.json(issues);
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/issue-reports');
  if (error) return error;
  const role = (session!.user as any).role;
  if (!['admin', 'invigilator', 'exam_officer'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await request.json();
    const issue = await prisma.issueReport.update({ where: { id: body.issueId }, data: { acknowledgedAt: new Date(), acknowledgedBy: session!.user.id, acknowledgementNote: body.note ? String(body.note).slice(0, 500) : null } });
    await createAuditEvent({ actorId: session!.user.id, actionType: 'issue_report_acknowledged', entityType: 'issue_report', entityId: issue.id, metadata: { attemptId: issue.attemptId } });
    return NextResponse.json(issue);
  } catch {
    return NextResponse.json({ error: 'Could not acknowledge issue report' }, { status: 500 });
  }
}
