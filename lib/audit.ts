import { prisma } from '@/lib/prisma';
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

function hashPayload(payload: Record<string, unknown>): string {
  const variants = [
    stableStringify(payload),
    JSON.stringify(payload),
  ];

  for (const variant of variants) {
    if (!variant) continue;
    const hash = crypto.createHash('sha256').update(variant).digest('hex');
    return hash;
  }

  return crypto.createHash('sha256').update('').digest('hex');
}

export type AuditEventInput = {
  actorId: string | null;
  actionType: string;
  entityType?: string;
  entityId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditEvent({
  actorId,
  actionType,
  entityType,
  entityId,
  reason,
  metadata,
}: AuditEventInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext('audit-event-chain'))
        )
        SELECT TRUE AS locked FROM lock_result
      `;

      const lastEvent = await tx.auditEvent.findFirst({
        orderBy: { occurredAt: 'desc' },
        select: { hash: true, occurredAt: true },
      });
      const prevHash = lastEvent?.hash ?? 'GENESIS';
      const now = new Date();
      const occurredAt = lastEvent && now <= lastEvent.occurredAt
        ? new Date(lastEvent.occurredAt.getTime() + 1)
        : now;
      const normalizedEntityType = entityType ?? null;
      const normalizedEntityId = entityId ?? null;
      const normalizedReason = reason ?? null;
      const hash = hashPayload({
        actorId,
        actionType,
        entityType: normalizedEntityType,
        entityId: normalizedEntityId,
        reason: normalizedReason,
        metadata,
        prevHash,
        timestamp: occurredAt.toISOString(),
      });

      return tx.auditEvent.create({
        data: {
          actorId,
          actionType,
          entityType: normalizedEntityType,
          entityId: normalizedEntityId,
          reason: normalizedReason,
          metadataJson: metadata ? JSON.stringify(metadata) : null,
          occurredAt,
          prevHash,
          hash,
        },
      });
    });
  } catch (error) {
    console.error('Failed to create audit event:', error);
    return null;
  }
}
