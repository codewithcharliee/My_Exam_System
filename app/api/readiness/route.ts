export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

const REQUIRED_CHECKS = [
  'JavaScript',
  'IndexedDB',
  'Web Crypto API',
  'Network',
  'Camera',
  'Fullscreen',
  'Local Storage Write',
  'Autosave Simulation',
  'Sync Endpoint Reachability',
  'Submission Endpoint Reachability',
];

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/readiness');
  if (error) return error;

  try {
    const { checks } = await request.json();
    if (!Array.isArray(checks)) {
      return NextResponse.json({ error: 'Invalid readiness payload' }, { status: 400 });
    }

    const normalized = checks.map((check: any) => ({
      checkType: String(check?.checkType ?? ''),
      status: String(check?.status ?? 'fail'),
      details: check?.details ?? null,
    }));

    for (const check of normalized) {
      await prisma.readinessCheck.create({
        data: {
          candidateId: session!.user.id,
          checkType: check.checkType,
          status: check.status,
          detailsJson: check.details ? JSON.stringify(check.details) : null,
        },
      });
    }

    const checkMap = new Map(normalized.map((c) => [c.checkType, c.status]));
    const missing = REQUIRED_CHECKS.filter((name) => !checkMap.has(name));
    const failed = REQUIRED_CHECKS.filter((name) => checkMap.get(name) !== 'pass');

    const summary = {
      requiredChecks: REQUIRED_CHECKS,
      missingChecks: missing,
      failedChecks: failed,
      failedCount: failed.length,
      blocked: failed.length > 0,
      submittedCount: normalized.length,
      generatedAt: new Date().toISOString(),
    };

    await prisma.readinessCheck.create({
      data: {
        candidateId: session!.user.id,
        checkType: 'readiness_summary',
        status: summary.blocked ? 'fail' : 'pass',
        detailsJson: JSON.stringify(summary),
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'readiness_submitted',
      entityType: 'readiness_check',
      metadata: summary,
    });

    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to save checks' }, { status: 500 });
  }
}
