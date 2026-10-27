import { NextRequest, NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  await createAuditEvent({
    actorId: null,
    actionType: 'authorization_denied',
    entityType: 'authorization',
    metadata: {
      action: 'public_signup',
      outcome: 'denied',
      reason: 'public_registration_disabled',
      method: request.method,
    },
  });

  return NextResponse.json(
    { error: 'Public registration is disabled. Contact authorized staff to create a profile.' },
    { status: 403 },
  );
}
