export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import crypto from 'crypto';

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function computeHash(ev: any, prevHash: string) {
  const payload = {
    actorId: ev.actorId,
    actionType: ev.actionType,
    entityType: ev.entityType,
    entityId: ev.entityId,
    reason: ev.reason,
    metadata: ev.metadataJson ? JSON.parse(ev.metadataJson) : undefined,
    prevHash,
    timestamp: new Date(ev.occurredAt).toISOString(),
  };

  const variants = [stableStringify(payload), JSON.stringify(payload)];
  for (const variant of variants) {
    if (!variant) continue;
    const candidate = crypto.createHash('sha256').update(variant).digest('hex');
    if (ev.hash === candidate) {
      return candidate;
    }
  }

  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export async function GET(request: NextRequest) {
  const { error } = await requireRouteAuthorization('GET /api/audit/verify');
  if (error) return error;

  try {
    const events = await prisma.auditEvent.findMany({ orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });

    let isValid = true;
    let brokenIndex: number | null = null;
    let previousHash = 'GENESIS';
    let hashMismatchCount = 0;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if ((ev.prevHash ?? 'GENESIS') !== previousHash) {
        isValid = false;
        brokenIndex = i;
        break;
      }

      let computed = '';
      try {
        computed = computeHash(ev, previousHash);
      } catch {
        computed = '';
      }

      if (!computed || ev.hash !== computed) {
        hashMismatchCount += 1;
      }

      previousHash = ev.hash ?? previousHash;
    }

    return NextResponse.json({
      verified: isValid && hashMismatchCount === 0,
      linkIntegrity: isValid,
      hashIntegrity: hashMismatchCount === 0,
      hashMismatchCount,
      totalEvents: events.length,
      brokenIndex,
      lastHash: events.length > 0 ? events[events.length - 1].hash : 'GENESIS',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Audit verification failed' }, { status: 500 });
  }
}
