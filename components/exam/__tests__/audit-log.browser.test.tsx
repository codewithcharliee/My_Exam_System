import { createElement } from 'react';
import type { NextRequest } from 'next/server';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

type AttemptRecord = {
  id: string;
  status: 'in_progress' | 'reset';
  isActive: boolean;
};

type AuditEventRecord = {
  id: string;
  actorId: string | null;
  actor: { id: string; name: string; email: string; role: string };
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  metadataJson: string | null;
  occurredAt: Date;
  prevHash: string | null;
  hash: string | null;
};

const { auditEvents, attempt, admin, prismaMock, authorizationMock, auditLoggerMock } = vi.hoisted(() => {
  const storedEvents: AuditEventRecord[] = [];
  const attemptRecord: AttemptRecord = {
    id: 'attempt-unit11-1234',
    status: 'in_progress',
    isActive: true,
  };
  const adminUser = {
    id: 'admin-unit11-1234',
    name: 'Ada Admin',
    email: 'ada.admin@example.test',
    role: 'admin',
  };
  const recordAuditEvent = vi.fn(async (input: {
    actorId: string | null;
    actionType: string;
    entityType?: string;
    entityId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const latest = storedEvents[storedEvents.length - 1];
    const event: AuditEventRecord = {
      id: `audit-unit11-${storedEvents.length + 1}`,
      actorId: input.actorId,
      actor: adminUser,
      actionType: input.actionType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      reason: input.reason ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      occurredAt: new Date('2026-10-11T12:00:00.000Z'),
      prevHash: latest?.hash ?? 'GENESIS',
      hash: 'a'.repeat(64),
    };
    storedEvents.push(event);
    return event;
  });

  return {
    auditEvents: storedEvents,
    attempt: attemptRecord,
    admin: adminUser,
    prismaMock: {
      attempt: {
        update: vi.fn<(args: { where: { id: string }; data: Partial<AttemptRecord> }) => Promise<AttemptRecord>>(),
      },
      auditEvent: {
        findFirst: vi.fn<() => Promise<{ hash: string | null } | null>>(),
        create: vi.fn<(args: { data: Omit<AuditEventRecord, 'id' | 'actor'> }) => Promise<AuditEventRecord>>(),
        findMany: vi.fn<(args?: { orderBy?: { occurredAt?: 'asc' | 'desc' } }) => Promise<AuditEventRecord[]>>(),
        count: vi.fn<() => Promise<number>>(),
      },
    },
    authorizationMock: vi.fn(async () => ({
      error: null,
      session: { user: adminUser },
    })),
    auditLoggerMock: recordAuditEvent,
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/roles', () => ({ requireRouteAuthorization: authorizationMock }));
vi.mock('@/lib/audit', () => ({ createAuditEvent: auditLoggerMock }));

import AuditPage from '@/app/(dashboard)/dashboard/audit/page';

const h = createElement;
const attemptId = 'attempt-unit11-1234';
const resetReason = 'Candidate identity verified by the examination officer';
let resetAttempt: (request: NextRequest) => Promise<Response>;
let getAuditEntries: (request: NextRequest) => Promise<Response>;

async function loadAuditRouteModules(): Promise<void> {
  (globalThis as typeof globalThis & { __dirname?: string }).__dirname = new URL('../../..', import.meta.url).pathname;
  const resetModule = await import('@/app/api/admin/reset-attempt/route');
  const auditModule = await import('@/app/api/audit/route');
  resetAttempt = resetModule.POST;
  getAuditEntries = auditModule.GET;
}

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

function installAuditApiFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    const request = asNextRequest(new Request(url));

    if (url.pathname === '/api/audit') {
      return getAuditEntries(request);
    }
    if (url.pathname === '/api/audit/verify') {
      return Response.json({
        verified: true,
        linkIntegrity: true,
        hashIntegrity: true,
        hashMismatchCount: 0,
        totalEvents: auditEvents.length,
        brokenIndex: null,
      });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }));
}

describe('Unit Test 11 — audit-log generation', () => {
  beforeEach(async () => {
    await loadAuditRouteModules();
    vi.clearAllMocks();
    auditEvents.length = 0;
    attempt.status = 'in_progress';
    attempt.isActive = true;

    prismaMock.attempt.update.mockImplementation(async ({ where, data }) => {
      if (where.id !== attempt.id) throw new Error('Unexpected attempt ID');
      Object.assign(attempt, data);
      return { ...attempt };
    });
    prismaMock.auditEvent.findFirst.mockImplementation(async () => {
      const latest = auditEvents[auditEvents.length - 1];
      return latest ? { hash: latest.hash } : null;
    });
    prismaMock.auditEvent.create.mockImplementation(async ({ data }) => {
      const event = {
        ...data,
        id: `audit-unit11-${auditEvents.length + 1}`,
        actor: admin,
      };
      auditEvents.push(event);
      return event;
    });
    prismaMock.auditEvent.findMany.mockImplementation(async ({ orderBy } = {}) => {
      const events = [...auditEvents];
      return orderBy?.occurredAt === 'asc' ? events : events.reverse();
    });
    prismaMock.auditEvent.count.mockImplementation(async () => auditEvents.length);
    installAuditApiFetch();
  });

  it('logs the actual administrative reset and displays every required field in the audit viewer', async () => {
    const response = await resetAttempt(asNextRequest(new Request('http://localhost/api/admin/reset-attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, reason: resetReason }),
    })));
    const responseBody = await response.json() as { success?: boolean };
    const event = auditEvents.find((entry) => entry.actionType === 'attempt_reset');

    expect(response.status).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(attempt).toMatchObject({ id: attemptId, status: 'reset', isActive: false });
    expect(event).toMatchObject({
      actorId: admin.id,
      actionType: 'attempt_reset',
      entityType: 'attempt',
      entityId: attemptId,
      reason: resetReason,
      metadataJson: JSON.stringify({ outcome: 'allowed' }),
    });
    expect(event?.occurredAt.toISOString()).toBe('2026-10-11T12:00:00.000Z');
    expect(event?.prevHash).toBe('GENESIS');
    expect(event?.hash).toMatch(/^[a-f0-9]{64}$/);

    render(h(AuditPage));

    await expect.element(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible();
    await expect.element(page.getByText(admin.name, { exact: true })).toBeVisible();
    await expect.element(page.getByText('attempt_reset', { exact: true })).toBeVisible();
    await expect.element(page.getByText(attemptId, { exact: true })).toBeVisible();
    await expect.element(page.getByText(resetReason, { exact: true })).toBeVisible();
    await expect.element(page.getByText('Verified', { exact: true })).toBeVisible();
    await expect(page).toMatchScreenshot('unit-test-11-audit-log/scenario-specific-ui-screenshots/admin-audit-log-viewer');
  });
});
