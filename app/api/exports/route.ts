export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import * as archiver from 'archiver';
import ExcelJS from 'exceljs';
import * as encryptedZip from 'archiver-zip-encrypted';

type ExportAttempt = any;
function scoreOf(decision: any) { return decision?.officialGrade ?? null; }
function safeName(value: string) { return value.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80); }
async function bufferZip(files: Array<{ name: string; content: string }>, password: string) {
  const archiveFactory = archiver as any;
  archiveFactory.registerFormat('zip-encrypted', encryptedZip as any);
  const chunks: Buffer[] = [];
  const archive = archiveFactory.create('zip-encrypted', { zlib: { level: 9 }, encryptionMethod: 'aes256', password });
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => { archive.on('end', () => resolve()); archive.on('error', reject); });
  for (const file of files) archive.append(file.content, { name: file.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/exports');
  if (error) return error;
  try {
    const body = await request.json();
    const assessmentId = String(body.assessmentId ?? '');
    const format = String(body.format ?? 'zip');
    const password = String(body.password ?? '');
    if (!assessmentId || password.length < 8 || !['zip', 'xlsx'].includes(format)) return NextResponse.json({ error: 'Assessment, format, and a password of at least eight characters are required' }, { status: 400 });
    const role = (session!.user as any).role;
    const allowedCourseIds = role === 'lecturer' ? (await prisma.userCourse.findMany({ where: { userId: session!.user.id, role: 'lecturer' }, select: { courseId: true } })).map((row) => row.courseId) : undefined;
    if (allowedCourseIds && body.courseId && !allowedCourseIds.includes(String(body.courseId))) return NextResponse.json({ error: 'You are not authorized for this course' }, { status: 403 });
    const assessment = await prisma.assessment.findFirst({ where: { id: assessmentId, courseId: body.courseId ? String(body.courseId) : allowedCourseIds ? { in: allowedCourseIds } : undefined }, include: { course: true, items: { include: { question: true }, orderBy: { displayOrder: 'asc' } }, attempts: { where: { status: { in: ['submitted', 'auto_submitted_violation', 'timed_out'] } }, include: { candidate: { select: { name: true, email: true, matricNumber: true } }, responses: true, gradeDecisions: true }, orderBy: { createdAt: 'asc' } } } });
    if (!assessment) return NextResponse.json({ error: 'No authorized records are available to export' }, { status: 404 });
    const attempts = assessment.attempts as ExportAttempt[];
    if (!attempts.length) return NextResponse.json({ error: 'No authorized records are available to export' }, { status: 404 });
    const rows = attempts.flatMap((attempt) => assessment.items.map((item) => { const response = attempt.responses.find((entry: any) => entry.questionId === item.questionId); const decision = attempt.gradeDecisions.find((entry: any) => entry.questionId === item.questionId); return { attempt, item, response, decision }; }));
    await createAuditEvent({ actorId: session!.user.id, actionType: 'export_generated', entityType: 'assessment', entityId: assessment.id, metadata: { format, attemptsIncluded: attempts.length, courseId: assessment.courseId } });
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Responses');
      sheet.columns = [{ header: 'Candidate identifier', key: 'candidate' }, { header: 'Matriculation number', key: 'matricNumber' }, { header: 'Question identifier', key: 'questionId' }, { header: 'Question text', key: 'question' }, { header: 'Response', key: 'response' }, { header: 'Word count', key: 'wordCount' }, { header: 'Provisional outcome', key: 'provisional' }, { header: 'AI recommendation', key: 'aiRecommendation' }, { header: 'Official lecturer grade', key: 'officialGrade' }];
      for (const row of rows) sheet.addRow({ candidate: row.attempt.candidate.email, matricNumber: row.attempt.candidate.matricNumber ?? '', questionId: row.item.questionId, question: row.item.question.text, response: row.response?.currentText ?? row.response?.selectedOptionId ?? '', wordCount: row.response?.wordCount ?? 0, provisional: row.decision?.provisionalScore ?? '', aiRecommendation: row.decision?.aiRecommendationJson ?? '', officialGrade: scoreOf(row.decision) ?? '' });
      const audit = workbook.addWorksheet('Audit metadata');
      audit.addRow(['Assessment', assessment.title]); audit.addRow(['Course', assessment.course.code]); audit.addRow(['Exported at', new Date().toISOString()]); audit.addRow(['Attempts included', attempts.length]); audit.addRow(['Exported by', session!.user.id]);
      const output = Buffer.from(await workbook.xlsx.writeBuffer());
      return new NextResponse(output, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${safeName(assessment.title)}-export.xlsx"` } });
    }
    const files = attempts.map((attempt) => { const content = [`Assessment, ${assessment.title}`, `Candidate identifier, ${attempt.candidate.email}`, `Matriculation number, ${attempt.candidate.matricNumber ?? ''}`, '', ...assessment.items.map((item: any) => { const response = attempt.responses.find((entry: any) => entry.questionId === item.questionId); const decision = attempt.gradeDecisions.find((entry: any) => entry.questionId === item.questionId); return [`Question identifier, ${item.questionId}`, `Question text, ${item.question.text}`, `Response, ${response?.currentText ?? response?.selectedOptionId ?? ''}`, `Word count, ${response?.wordCount ?? 0}`, `Provisional outcome, ${decision?.provisionalScore ?? ''}`, `AI recommendation, ${decision?.aiRecommendationJson ?? ''}`, `Official lecturer grade, ${scoreOf(decision) ?? ''}`, ''].join('\n'); })].join('\n'); return { name: `${safeName(attempt.candidate.matricNumber ?? attempt.candidate.email)}-${attempt.id}.txt`, content }; });
    const output = await bufferZip(files, password);
    return new NextResponse(output, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safeName(assessment.title)}-export.zip"` } });
  } catch (error) {
    console.error('Export error', error);
    return NextResponse.json({ error: 'Export could not be generated' }, { status: 500 });
  }
}
