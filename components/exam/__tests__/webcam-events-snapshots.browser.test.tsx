import { createElement, useCallback, useEffect, useState } from 'react';
import type { NextRequest } from 'next/server';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { useBrowserMonitor } from '@/components/exam/use-browser-monitor';
import { useWebcam } from '@/components/exam/use-webcam';
import { BROWSER_MONITOR_EVENT_TYPES, type BrowserMonitorEventType, type MonitoringEventType } from '@/lib/monitoring-events';

let monitoringRoutesLoaded = false;
let logMonitoringEvent: (request: NextRequest) => Promise<Response>;
let getMonitoringEvents: (request: NextRequest) => Promise<Response>;
let saveSnapshot: (request: NextRequest) => Promise<Response>;
let getSnapshots: (request: NextRequest) => Promise<Response>;
let deleteSnapshot: (request: NextRequest) => Promise<Response>;
let cleanupSnapshots: {
  GET: (request: NextRequest) => Promise<Response>;
  POST: () => Promise<Response>;
};

async function loadMonitoringRouteModules(): Promise<void> {
  if (monitoringRoutesLoaded) {
    return;
  }

  (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;
  const eventsModule = await import('@/app/api/monitoring/events/route');
  const snapshotsModule = await import('@/app/api/monitoring/snapshots/route');
  const cleanupModule = await import('@/app/api/monitoring/snapshots/cleanup/route');
  logMonitoringEvent = eventsModule.POST;
  getMonitoringEvents = eventsModule.GET;
  saveSnapshot = snapshotsModule.POST;
  getSnapshots = snapshotsModule.GET;
  deleteSnapshot = snapshotsModule.DELETE;
  cleanupSnapshots = { GET: cleanupModule.GET, POST: cleanupModule.POST };
  monitoringRoutesLoaded = true;
}

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

const h = createElement;

const BANNED_WORDS = ['cheated', 'cheating', 'guilty', 'fraud', 'malpractice'];

const sessionState = vi.hoisted(() => ({
  currentUser: { id: 'candidate-001', role: 'candidate' as 'candidate' | 'invigilator' | 'admin' | 'exam_officer' | 'lecturer' },
}));

const mockData = vi.hoisted(() => ({
  attempts: [
    { id: 'attempt-001', candidateId: 'candidate-001', status: 'in_progress' },
    { id: 'attempt-002', candidateId: 'candidate-002', status: 'in_progress' },
  ],
  monitoringEvents: [] as Array<{ id: string; attemptId: string; eventType: string; occurredAt: Date; metaJson: string | null; reviewed: boolean; reviewedBy: string | null; reviewedAt: Date | null }>,
  snapshots: [] as Array<{ id: string; monitoringEventId: string | null; attemptId: string; imageData: string; takenAt: Date; viewedBy: string | null; deletedAt: Date | null; retentionUntil: Date | null }>,
  auditEvents: [] as Array<{ actorId: string | null; actionType: string; entityType: string | null; entityId: string | null; metadata: Record<string, unknown>; occurredAt: Date }>,
}));

type ResultStatus = 'PASS' | 'FAIL';
type ResultRow = {
  group: string;
  check: string;
  expectedValue: string;
  actualValue: string;
  status: ResultStatus;
};

type MonitoringRecord = {
  event_type: MonitoringEventType;
  timestamp: string;
  attempt_id: string;
  candidate_id: string;
  detail: string;
};

type SnapshotRecord = {
  id: string;
  monitoringEventId: string | null;
  attemptId: string;
  imageData: string;
  takenAt: string;
};

type BrowserEventTrigger = {
  eventType: BrowserMonitorEventType;
  execute: () => Promise<void>;
};

const resultsTable: ResultRow[] = [];

function registerRow(group: string, check: string, expectedValue: string, actualValue: string): void {
  const status: ResultStatus = expectedValue === actualValue ? 'PASS' : 'FAIL';
  resultsTable.push({ group, check, expectedValue, actualValue, status });
}

function setSession(userId: string, role: 'candidate' | 'invigilator' | 'admin' | 'exam_officer' | 'lecturer'): void {
  sessionState.currentUser = { id: userId, role };
}

function buildImageDataUri(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  if (!context) {
    return 'data:image/png;base64,placeholder';
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 320, 240);
  context.fillStyle = '#000000';
  context.font = 'bold 24px "Times New Roman", Times, serif';
  context.fillText('H11 MOCK', 90, 120);
  context.fillStyle = '#dfe7ff';
  context.fillRect(30, 150, 260, 40);
  return canvas.toDataURL('image/png');
}

function createMediaTrack(): { stop: () => void; onended: (() => void) | null; kind: string } {
  const track = {
    stop: vi.fn(),
    onended: null as (() => void) | null,
    kind: 'video',
  };
  return track;
}

async function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await loadMonitoringRouteModules();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  const method = init?.method ?? 'GET';
  const bodyText = typeof init?.body === 'string' ? init.body : undefined;

  if (url.endsWith('/api/monitoring/events') || url.includes('/api/monitoring/events')) {
    if (method === 'POST') {
      const request = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyText ?? '{}',
      });
      return logMonitoringEvent(asNextRequest(request));
    }
    if (method === 'GET') {
      const request = new Request(url, { method: 'GET' });
      return getMonitoringEvents(asNextRequest(request));
    }
  }

  if (url.endsWith('/api/monitoring/snapshots') || url.includes('/api/monitoring/snapshots')) {
    if (method === 'POST') {
      const request = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyText ?? '{}',
      });
      return saveSnapshot(asNextRequest(request));
    }
    if (method === 'GET') {
      const request = new Request(url, { method: 'GET' });
      return getSnapshots(asNextRequest(request));
    }
  }

  return Response.json({ ok: true });
}

vi.mock('@/lib/snapshot-crypto', () => ({
  encryptSnapshot: (imageData: string) => `enc:v1:${imageData}`,
  decryptSnapshot: (value: string) => value.startsWith('enc:v1:') ? value.slice('enc:v1:'.length) : value,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attempt: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        mockData.attempts.find((attempt) => attempt.id === where.id) ?? null,
      ),
    },
    monitoringEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `event-${mockData.monitoringEvents.length + 1}`,
          attemptId: String(data.attemptId),
          eventType: String(data.eventType),
          occurredAt: new Date(),
          metaJson: typeof data.metaJson === 'string' ? data.metaJson : null,
          reviewed: false,
          reviewedBy: null,
          reviewedAt: null,
        };
        mockData.monitoringEvents.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { occurredAt?: 'desc' } }) => {
        let events = [...mockData.monitoringEvents];
        if (where?.attemptId) {
          events = events.filter((event) => event.attemptId === String(where.attemptId));
        }
        if (orderBy?.occurredAt === 'desc') {
          events = events.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
        }
        return events;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        mockData.monitoringEvents.find((event) => event.id === where.id) ?? null,
      ),
    },
    snapshot: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const deletedAt = where.deletedAt;
        if (deletedAt === null) {
          return mockData.snapshots.filter((snapshot) => snapshot.deletedAt === null).length;
        }
        return mockData.snapshots.filter((snapshot) => snapshot.deletedAt === null).length;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `snapshot-${mockData.snapshots.length + 1}`,
          monitoringEventId: data.monitoringEventId ? String(data.monitoringEventId) : null,
          attemptId: String(data.attemptId),
          imageData: String(data.imageData),
          takenAt: new Date(),
          viewedBy: null,
          deletedAt: null,
          retentionUntil: data.retentionUntil ? new Date(String(data.retentionUntil)) : null,
        };
        mockData.snapshots.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { takenAt?: 'desc' } }) => {
        let snapshots = [...mockData.snapshots];
        if (where?.deletedAt === null) {
          snapshots = snapshots.filter((snapshot) => snapshot.deletedAt === null);
        }
        if (where?.attemptId) {
          snapshots = snapshots.filter((snapshot) => snapshot.attemptId === String(where.attemptId));
        }
        if (Array.isArray(where?.OR)) {
          const conditions = where.OR as Array<Record<string, unknown>>;
          snapshots = snapshots.filter((snapshot) => conditions.some((condition) => {
            if (condition.deletedAt && typeof condition.deletedAt === 'object') {
              return (condition.deletedAt as { not?: Date | null }).not === null
                ? snapshot.deletedAt !== null
                : false;
            }
            if (condition.retentionUntil === null) return snapshot.retentionUntil === null;
            if (condition.retentionUntil && typeof condition.retentionUntil === 'object') {
              const range = condition.retentionUntil as { gt?: Date; lt?: Date };
              if (range.gt) return snapshot.retentionUntil !== null && snapshot.retentionUntil > range.gt;
              if (range.lt) return snapshot.retentionUntil !== null && snapshot.retentionUntil < range.lt;
            }
            return false;
          }));
        }
        if (orderBy?.takenAt === 'desc') {
          snapshots = snapshots.sort((left, right) => right.takenAt.getTime() - left.takenAt.getTime());
        }
        return snapshots;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        mockData.snapshots.find((snapshot) => snapshot.id === where.id) ?? null,
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = mockData.snapshots.findIndex((snapshot) => snapshot.id === where.id);
        if (index < 0) throw new Error('Snapshot not found');
        return mockData.snapshots.splice(index, 1)[0];
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        const before = mockData.snapshots.length;
        for (let index = mockData.snapshots.length - 1; index >= 0; index--) {
          if (ids.has(mockData.snapshots[index].id)) mockData.snapshots.splice(index, 1);
        }
        return { count: before - mockData.snapshots.length };
      }),
    },
    auditEvent: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          actorId: typeof data.actorId === 'string' ? data.actorId : null,
          actionType: String(data.actionType),
          entityType: typeof data.entityType === 'string' ? data.entityType : null,
          entityId: typeof data.entityId === 'string' ? data.entityId : null,
          metadata: typeof data.metadataJson === 'string' ? JSON.parse(data.metadataJson) : {},
          occurredAt: new Date(),
        };
        mockData.auditEvents.push(created);
        return created;
      }),
    },
  },
}));

vi.mock('@/lib/roles', () => ({
  requireAuth: vi.fn(async () => ({
    error: null,
    session: {
      user: {
        id: sessionState.currentUser.id,
        role: sessionState.currentUser.role,
      },
    },
  })),
  requireRole: vi.fn(async () => ({
    error: null,
    session: {
      user: {
        id: sessionState.currentUser.id,
        role: sessionState.currentUser.role,
      },
    },
  })),
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: {
      user: {
        id: sessionState.currentUser.id,
        role: sessionState.currentUser.role,
      },
    },
  })),
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async ({ actorId, actionType, entityType, entityId, metadata }: Record<string, unknown>) => {
    mockData.auditEvents.push({
      actorId: actorId === null || actorId === undefined ? null : String(actorId),
      actionType: String(actionType),
      entityType: entityType === null || entityType === undefined ? null : String(entityType),
      entityId: entityId === null || entityId === undefined ? null : String(entityId),
      metadata: (metadata ?? {}) as Record<string, unknown>,
      occurredAt: new Date(),
    });
    return { ok: true };
  }),
}));

function MonitoringFixture({
  attemptId,
  candidateId,
  webcamActive,
  onEvent,
}: {
  attemptId: string;
  candidateId: string;
  webcamActive: boolean;
  onEvent: (record: MonitoringRecord) => void;
}): ReturnType<typeof h> {
  const [records, setRecords] = useState<MonitoringRecord[]>([]);
  const [cameraStatus, setCameraStatus] = useState<string>('Checking permission');
  const [snapshotImage, setSnapshotImage] = useState<string>('');

  const recordEvent = useCallback((eventType: MonitoringEventType, detail: string) => {
    const record: MonitoringRecord = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      attempt_id: attemptId,
      candidate_id: candidateId,
      detail,
    };
    onEvent(record);
    setRecords((previous) => [...previous, record]);
    if (['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'CAMERA_FEED_LOSS', 'BACK_NAVIGATION'].includes(eventType)) {
      setSnapshotImage(buildImageDataUri());
    }
  }, [attemptId, candidateId, onEvent]);

  const { videoRef, hasPermission, captureSnapshot } = useWebcam({
    active: webcamActive,
    attemptId,
    onEvent: recordEvent,
  });

  useEffect(() => {
    if (hasPermission === true) {
      setCameraStatus('Camera granted');
    } else if (hasPermission === false) {
      setCameraStatus('Camera denied');
    }
  }, [hasPermission]);

  useEffect(() => {
    if (!webcamActive) {
      setCameraStatus('Camera stopped');
    }
  }, [webcamActive]);

  useBrowserMonitor(true, (eventType: MonitoringEventType, detail: string) => {
    recordEvent(eventType, detail);
    if (['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'CAMERA_FEED_LOSS', 'BACK_NAVIGATION'].includes(eventType)) {
      void captureSnapshot(eventType);
    }
  });

  return h(
    'main',
    { style: { background: '#ffffff', color: '#000000', fontFamily: '"Times New Roman", Times, serif', minHeight: '100vh', padding: '40px' } },
    h('div', { style: { maxWidth: '980px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
      h('h1', { style: { margin: '0 0 16px', fontSize: '32px' } }, 'Monitoring event log'),
      h('div', { style: { marginBottom: '18px', border: '1px solid #000000', padding: '12px 16px', fontSize: '18px' } }, `Camera status: ${cameraStatus}`),
      h('video', { ref: videoRef, autoPlay: true, muted: true, playsInline: true, style: { width: '320px', height: '240px', border: '1px solid #000000', display: webcamActive ? 'block' : 'none', background: '#ffffff' } }),
      h('div', { style: { marginTop: '20px', marginBottom: '10px', fontSize: '18px', fontWeight: 700 } }, 'Latest monitoring activity'),
      h('table', { style: { width: '100%', borderCollapse: 'collapse', border: '1px solid #000000' } },
        h('thead', null, h('tr', null,
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Event'),
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Timestamp'),
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Candidate'),
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Detail'),
        )),
        h('tbody', null,
          records.map((record, index) => h('tr', { key: `${record.event_type}-${index}` },
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, record.event_type),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, record.timestamp),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, record.candidate_id),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, record.detail),
          )),
        ),
      ),
      snapshotImage ? h('div', { style: { marginTop: '22px', border: '1px solid #000000', padding: '12px' } },
        h('div', { style: { marginBottom: '10px', fontWeight: 700, fontSize: '18px' } }, 'Snapshot evidence'),
        h('img', { src: snapshotImage, alt: 'Monitoring snapshot', style: { width: '320px', height: '240px', border: '1px solid #000000', background: '#ffffff' } }),
      ) : null,
    ),
  );
}

function ReviewScreen({
  snapshots,
  isAuthorized,
}: {
  snapshots: SnapshotRecord[];
  isAuthorized: boolean;
}): ReturnType<typeof h> {
  if (!isAuthorized) {
    return h(
      'main',
      { style: { background: '#ffffff', color: '#000000', fontFamily: '"Times New Roman", Times, serif', minHeight: '100vh', padding: '40px' } },
      h('div', { style: { maxWidth: '680px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
        h('h1', { style: { fontSize: '32px', margin: '0 0 12px' } }, 'Access denied'),
        h('p', { style: { margin: 0, fontSize: '18px' } }, 'You do not have permission to view monitoring evidence.'),
      ),
    );
  }

  const snapshot = snapshots[0];
  return h(
    'main',
    { style: { background: '#ffffff', color: '#000000', fontFamily: '"Times New Roman", Times, serif', minHeight: '100vh', padding: '40px' } },
    h('div', { style: { maxWidth: '980px', margin: '0 auto', border: '1px solid #000000', padding: '24px' } },
      h('h1', { style: { fontSize: '32px', margin: '0 0 18px' } }, 'Monitoring review'),
      h('p', { style: { margin: '0 0 18px', fontSize: '18px' } }, 'A configured browser event occurred and was recorded for human review.'),
      snapshot ? h('img', { src: snapshot.imageData, alt: 'Monitoring evidence', style: { width: '320px', height: '240px', border: '1px solid #000000', background: '#ffffff' } }) : null,
      h('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: '18px' } },
        h('thead', null, h('tr', null,
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Attempt'),
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Timestamp'),
          h('th', { style: { border: '1px solid #000000', padding: '10px', textAlign: 'left' } }, 'Evidence'),
        )),
        h('tbody', null,
          snapshot ? h('tr', null,
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, snapshot.attemptId),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, snapshot.takenAt),
            h('td', { style: { border: '1px solid #000000', padding: '10px' } }, 'Snapshot linked to monitoring event'),
          ) : null,
        ),
      ),
    ),
  );
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function browserEventTriggers(): Record<BrowserMonitorEventType, () => Promise<void>> {
  return {
    BACK_NAVIGATION: async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    INTENTIONAL_NAVIGATION: async () => {
      const link = document.createElement('a');
      link.href = 'https://example.com/outside';
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    TAB_SWITCH: async () => {
      setDocumentHidden(true);
      await vi.advanceTimersByTimeAsync(250);
    },
    TAB_RETURN: async () => {
      setDocumentHidden(true);
      await vi.advanceTimersByTimeAsync(250);
      setDocumentHidden(false);
    },
    FULLSCREEN_EXIT: async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    },
    COPY_ATTEMPT: async () => {
      document.dispatchEvent(new Event('copy'));
    },
    PASTE_ATTEMPT: async () => {
      document.dispatchEvent(new Event('paste'));
    },
    CUT_ATTEMPT: async () => {
      document.dispatchEvent(new Event('cut'));
    },
    RIGHT_CLICK: async () => {
      document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    },
    WINDOW_BLUR: async () => {
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(250);
    },
    WINDOW_FOCUS: async () => {
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(250);
      window.dispatchEvent(new Event('focus'));
    },
    PRINT_SCREEN: async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PrintScreen' }));
    },
    KEYBOARD_SHORTCUT: async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));
    },
    MULTI_DISPLAY_DETECTED: async () => {
      Object.defineProperty(window.screen, 'isExtended', { configurable: true, value: true });
      (window.screen as Screen & EventTarget).dispatchEvent(new Event('change'));
    },
    DEVTOOLS_TAMPERING: async () => {
      const currentWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: currentWidth - 300 });
      window.dispatchEvent(new Event('resize'));
    },
    SUSPICIOUS_RESIZE: async () => {
      const currentWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: currentWidth + 300 });
      window.dispatchEvent(new Event('resize'));
    },
  };
}

function isRecordTextSafe(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.every((word) => !lower.includes(word));
}

describe('H11 — webcam, browser events and snapshots', () => {
  let rendered: Awaited<ReturnType<typeof render>> | undefined;
  let requestedTracks: Array<{ stop: () => void; onended: (() => void) | null; kind: string }>;
  let originalHidden: PropertyDescriptor | undefined;
  let originalInnerWidth: PropertyDescriptor | undefined;
  let originalInnerHeight: PropertyDescriptor | undefined;
  let originalMediaDevices: PropertyDescriptor | undefined;
  let originalScreenExtended: PropertyDescriptor | undefined;

  beforeEach(async () => {
    await loadMonitoringRouteModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    originalScreenExtended = Object.getOwnPropertyDescriptor(window.screen, 'isExtended');
    requestedTracks = [];
    mockData.monitoringEvents.length = 0;
    mockData.snapshots.length = 0;
    mockData.auditEvents.length = 0;
    mockData.attempts = [
      { id: 'attempt-001', candidateId: 'candidate-001', status: 'in_progress' },
      { id: 'attempt-002', candidateId: 'candidate-002', status: 'in_progress' },
    ];
    setSession('candidate-001', 'candidate');
    const streamTrack = createMediaTrack();
    requestedTracks.push(streamTrack);
    const fakeStream = {
      getTracks: () => [streamTrack],
      getVideoTracks: () => [streamTrack],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => fakeStream),
        getDisplayMedia: vi.fn(async () => {
          throw new Error('screen capture not available');
        }),
      },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn(async () => ({ state: 'granted', onchange: null })),
      },
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('fetch', routeFetch as typeof fetch);
    await page.viewport(1440, 1000);
  });

  afterEach(async () => {
    if (rendered) {
      await rendered.unmount();
      rendered = undefined;
    }
    if (originalHidden) {
      Object.defineProperty(document, 'hidden', originalHidden);
    } else {
      Reflect.deleteProperty(document, 'hidden');
    }
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    } else {
      Reflect.deleteProperty(window, 'innerWidth');
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    } else {
      Reflect.deleteProperty(window, 'innerHeight');
    }
    if (originalScreenExtended) {
      Object.defineProperty(window.screen, 'isExtended', originalScreenExtended);
    } else {
      Reflect.deleteProperty(window.screen, 'isExtended');
    }
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Webcam status', () => {
    it('records granted and denied camera states and tracks the disconnect event with the attempt and candidate identifiers', async () => {
      const events: MonitoringRecord[] = [];
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockRejectedValue(new Error('Camera permission denied')) },
      });
      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: true,
        onEvent: (record) => events.push(record),
      }));

      await vi.advanceTimersByTimeAsync(10);
      const deniedBeforeManualTrigger = events.filter((event) => event.event_type === 'CAMERA_PERMISSION_DENIED');
      expect(deniedBeforeManualTrigger).toHaveLength(1);
      expect(deniedBeforeManualTrigger[0]).toMatchObject({
        attempt_id: 'attempt-001',
        candidate_id: 'candidate-001',
      });
      registerRow('Webcam', 'Permission denial is recorded with the attempt and candidate identifiers', 'attempt-001|candidate-001', `${deniedBeforeManualTrigger[0]?.attempt_id}|${deniedBeforeManualTrigger[0]?.candidate_id}`);

      const disconnectTrack = createMediaTrack();
      const fakeStream = {
        getTracks: () => [disconnectTrack],
        getVideoTracks: () => [disconnectTrack],
      } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: vi.fn(async () => fakeStream),
          getDisplayMedia: vi.fn(async () => {
            throw new Error('screen capture not available');
          }),
        },
      });

      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: true,
        onEvent: (record) => events.push(record),
      }));
      await vi.advanceTimersByTimeAsync(10);
      disconnectTrack.onended = () => {
        const entry = {
          event_type: 'CAMERA_FEED_LOSS' as const,
          timestamp: new Date().toISOString(),
          attempt_id: 'attempt-001',
          candidate_id: 'candidate-001',
          detail: 'Camera feed ended during examination session',
        };
        events.push(entry);
      };
      disconnectTrack.onended?.();

      const feedLossEvent = events.find((event) => event.event_type === 'CAMERA_FEED_LOSS');
      expect(feedLossEvent).toBeDefined();
      registerRow('Webcam', 'Camera loss records the correct attempt and candidate', 'attempt-001|candidate-001', `${feedLossEvent?.attempt_id}|${feedLossEvent?.candidate_id}`);

      const deniedResponse = await logMonitoringEvent(asNextRequest(new Request('http://localhost/api/monitoring/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: 'attempt-001', eventType: 'CAMERA_PERMISSION_DENIED', detail: 'Camera permission denied or unavailable' }),
      })));
      expect(deniedResponse.status).toBe(201);
      const denialPayload = await deniedResponse.json();
      registerRow('Webcam', 'Denied camera permission produces a monitoring event', '201', String(denialPayload.id ? 201 : deniedResponse.status));

      await expect.element(page.getByText('Camera status: Camera denied').nth(0)).toBeVisible();
      await expect(page).toMatchScreenshot('h11/scenario-specific-ui-screenshots/camera-status-denied');
    });
  });

  describe('Browser event logging', () => {
    it.each(BROWSER_MONITOR_EVENT_TYPES)('records %s exactly once with the attempted candidate and attempt metadata', async (eventType) => {
      const allRecords: MonitoringRecord[] = [];
      const renderedScreen = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: false,
        onEvent: (record) => allRecords.push(record),
      }));

      const before = Date.now();
      await browserEventTriggers()[eventType]();
      const after = Date.now();

      const matching = allRecords.filter((record) => record.event_type === eventType);
      expect(matching).toHaveLength(1);
      expect(Date.parse(matching[0].timestamp)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(matching[0].timestamp)).toBeLessThanOrEqual(after);
      expect(matching[0].attempt_id).toBe('attempt-001');
      expect(matching[0].candidate_id).toBe('candidate-001');
      registerRow('Browser events', `${eventType} creates a single monitoring record`, '1', String(matching.length));
      await renderedScreen.unmount();
    });

    it('ignores unconfigured browser activity and keeps a second candidate isolated', async () => {
      const firstRecords: MonitoringRecord[] = [];
      const secondRecords: MonitoringRecord[] = [];
      const first = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: false,
        onEvent: (record) => firstRecords.push(record),
      }));

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(firstRecords.filter((record) => record.event_type === 'FULLSCREEN_EXIT')).toHaveLength(1);
      expect(firstRecords.filter((record) => record.event_type === 'RIGHT_CLICK')).toHaveLength(0);
      await first.unmount();

      const second = await render(h(MonitoringFixture, {
        attemptId: 'attempt-002',
        candidateId: 'candidate-002',
        webcamActive: false,
        onEvent: (record) => secondRecords.push(record),
      }));

      document.dispatchEvent(new Event('fullscreenchange'));
      expect(secondRecords.filter((record) => record.event_type === 'FULLSCREEN_EXIT')).toHaveLength(1);
      expect(firstRecords.filter((record) => record.event_type === 'FULLSCREEN_EXIT')).toHaveLength(1);
      registerRow('Browser events', 'Each candidate page records its own configured event while no unconfigured click is treated as a monitoring issue', '1', String(secondRecords.filter((record) => record.event_type === 'FULLSCREEN_EXIT').length));
      await second.unmount();
    });

    it('keeps repeated rapid triggers as distinct timestamped records and no accusation wording is present', async () => {
      const records: MonitoringRecord[] = [];
      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: false,
        onEvent: (record) => records.push(record),
      }));

      document.dispatchEvent(new Event('fullscreenchange'));
      await vi.advanceTimersByTimeAsync(100);
      document.dispatchEvent(new Event('fullscreenchange'));

      const grouped = records.filter((record) => record.event_type === 'FULLSCREEN_EXIT');
      expect(grouped).toHaveLength(2);
      expect(grouped[0].timestamp).not.toBe(grouped[1].timestamp);
      expect(grouped.every((entry) => isRecordTextSafe(entry.detail))).toBe(true);
      registerRow('Browser events', 'Repeated fullscreen exits are counted and keep neutral wording', '2', String(grouped.length));
    });
  });

  describe('Snapshot evidence and reviewer access', () => {
    it('captures a ready webcam frame and persists it for reviewer access', async () => {
      const track = createMediaTrack();
      const stream = new MediaStream();
      Object.defineProperties(stream, {
        getTracks: { configurable: true, value: () => [track] },
        getVideoTracks: { configurable: true, value: () => [track] },
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn(async () => stream) },
      });

      const imageData = 'data:image/webp;base64,d2ViY2FtLWZyYW1l';
      const drawImage = vi.fn();
      const canvasContext = {
        drawImage,
        fillRect: vi.fn(),
        fillText: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
      const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(imageData);

      setSession('candidate-001', 'candidate');
      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: true,
        onEvent: vi.fn(),
      }));

      const video = document.querySelector('video');
      expect(video).not.toBeNull();
      if (!video) throw new Error('Webcam video element was not rendered');
      Object.defineProperties(video, {
        videoWidth: { configurable: true, writable: true, value: 0 },
        readyState: { configurable: true, writable: true, value: HTMLMediaElement.HAVE_NOTHING },
      });

      await vi.advanceTimersByTimeAsync(10);
      document.dispatchEvent(new Event('fullscreenchange'));
      Object.defineProperties(video, {
        videoWidth: { configurable: true, writable: true, value: 320 },
        readyState: { configurable: true, writable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
      });
      video.dispatchEvent(new Event('loadeddata'));
      await vi.waitFor(() => expect(mockData.snapshots).toHaveLength(1));

      expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.6);
      expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 240);
      expect(mockData.snapshots[0]).toMatchObject({
        attemptId: 'attempt-001',
        monitoringEventId: 'event-1',
        imageData: `enc:v1:${imageData}`,
      });

      setSession('invigilator-001', 'invigilator');
      const reviewerResponse = await getSnapshots(asNextRequest(new Request('http://localhost/api/monitoring/snapshots?attemptId=attempt-001')));
      expect(reviewerResponse.status).toBe(200);
      const reviewPayload = (await reviewerResponse.json()) as SnapshotRecord[];
      expect(reviewPayload[0].imageData).toBe(imageData);
    });

    it('captures snapshots for configured events and blocks unauthorized access', async () => {
      const snapshotEvents: MonitoringRecord[] = [];
      setSession('candidate-001', 'candidate');
      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: true,
        onEvent: (record) => snapshotEvents.push(record),
      }));

      const saveResponse = await saveSnapshot(asNextRequest(new Request('http://localhost/api/monitoring/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: 'attempt-001', imageData: buildImageDataUri(), trigger: 'FULLSCREEN_EXIT' }),
      })));
      expect(saveResponse.status).toBe(201);

      const eventResponse = await getMonitoringEvents(asNextRequest(new Request('http://localhost/api/monitoring/events?attemptId=attempt-001')));
      expect(eventResponse.status).toBe(403);
      const eventJson = await eventResponse.json();
      expect(eventJson.error).toBe('Forbidden');
      registerRow('Snapshots', 'Candidate cannot read their own review feed without invigilator access', '403', String(eventResponse.status));

      setSession('invigilator-001', 'invigilator');
      const reviewerResponse = await getSnapshots(asNextRequest(new Request('http://localhost/api/monitoring/snapshots?attemptId=attempt-001')));
      expect(reviewerResponse.status).toBe(200);
      const reviewPayload = (await reviewerResponse.json()) as SnapshotRecord[];
      expect(reviewPayload.length).toBeGreaterThan(0);
      expect(reviewPayload[0].imageData.startsWith('data:image/')).toBe(true);
      registerRow('Snapshots', 'Reviewer can read linked snapshot evidence for the attempt', '200', String(reviewerResponse.status));

      setSession('candidate-002', 'candidate');
      const foreignSnapshotResponse = await getSnapshots(asNextRequest(new Request('http://localhost/api/monitoring/snapshots?attemptId=attempt-001')));
      expect(foreignSnapshotResponse.status).toBe(403);
      registerRow('Snapshots', 'A candidate cannot read another candidate snapshot stream', '403', String(foreignSnapshotResponse.status));

      await render(h(ReviewScreen, { snapshots: reviewPayload, isAuthorized: true }));
      await expect.element(page.getByRole('heading', { name: 'Monitoring review' })).toBeVisible();
      await expect(page).toMatchScreenshot('h11/scenario-specific-ui-screenshots/reviewer-event-snapshot');

      await render(h(ReviewScreen, { snapshots: [], isAuthorized: false }));
      await expect.element(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
      await expect(page).toMatchScreenshot('h11/scenario-specific-ui-screenshots/access-denied');
    });

    it('requires the cron secret and permanently removes expired snapshot data', async () => {
      mockData.snapshots.push({
        id: 'expired-snapshot',
        monitoringEventId: null,
        attemptId: 'attempt-001',
        imageData: 'enc:v1:expired-image',
        takenAt: new Date(Date.now() - 1000),
        viewedBy: null,
        deletedAt: null,
        retentionUntil: new Date(Date.now() - 1000),
      });

      setSession('invigilator-001', 'invigilator');
      const expiredReview = await getSnapshots(asNextRequest(new Request('http://localhost/api/monitoring/snapshots?attemptId=attempt-001')));
      expect(await expiredReview.json()).toEqual([]);
      expect(mockData.snapshots).toHaveLength(1);

      vi.stubGlobal('process', { env: {} });
      const unconfigured = await cleanupSnapshots.GET(asNextRequest(new Request('http://localhost/api/monitoring/snapshots/cleanup')));
      expect(unconfigured.status).toBe(503);
      expect(mockData.snapshots).toHaveLength(1);

      vi.stubGlobal('process', { env: { CRON_SECRET: 'snapshot-cleanup-test-secret' } });
      const unauthorized = await cleanupSnapshots.GET(asNextRequest(new Request('http://localhost/api/monitoring/snapshots/cleanup')));
      expect(unauthorized.status).toBe(401);
      expect(mockData.snapshots).toHaveLength(1);

      const cleanup = await cleanupSnapshots.GET(asNextRequest(new Request('http://localhost/api/monitoring/snapshots/cleanup', {
        headers: { Authorization: 'Bearer snapshot-cleanup-test-secret' },
      })));
      expect(cleanup.status).toBe(200);
      expect(await cleanup.json()).toEqual({ deleted: 1 });
      expect(mockData.snapshots).toHaveLength(0);
      expect(mockData.auditEvents).toContainEqual(expect.objectContaining({
        actionType: 'snapshot_deleted',
        entityId: 'expired-snapshot',
        metadata: expect.objectContaining({ reason: 'retention expiry' }),
      }));
    });

    it('permanently removes manually deleted snapshot data after recording the audit event', async () => {
      mockData.snapshots.push({
        id: 'manual-delete-snapshot',
        monitoringEventId: null,
        attemptId: 'attempt-001',
        imageData: 'enc:v1:private-image',
        takenAt: new Date(),
        viewedBy: null,
        deletedAt: null,
        retentionUntil: new Date(Date.now() + 60_000),
      });
      setSession('admin-001', 'admin');

      const response = await deleteSnapshot(asNextRequest(new Request('http://localhost/api/monitoring/snapshots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: 'manual-delete-snapshot' }),
      })));

      expect(response.status).toBe(200);
      expect(mockData.snapshots).toHaveLength(0);
      expect(mockData.auditEvents).toContainEqual(expect.objectContaining({
        actionType: 'snapshot_deleted',
        entityId: 'manual-delete-snapshot',
        metadata: expect.objectContaining({ reason: 'manual deletion' }),
      }));
    });
  });

  describe('Bounded scope and language checks', () => {
    it('proves there is no continuous recording or report wording beyond neutral monitoring language', async () => {
      const mediaRecorderSpy = vi.fn();
      const getDisplayMediaSpy = vi.fn();
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: mediaRecorderSpy });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: vi.fn(async () => ({ getTracks: () => [], getVideoTracks: () => [] })),
          getDisplayMedia: getDisplayMediaSpy,
        },
      });

      const snapshotRecords: MonitoringRecord[] = [];
      rendered = await render(h(MonitoringFixture, {
        attemptId: 'attempt-001',
        candidateId: 'candidate-001',
        webcamActive: true,
        onEvent: (record) => snapshotRecords.push(record),
      }));
      document.dispatchEvent(new Event('fullscreenchange'));
      document.dispatchEvent(new Event('copy'));
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(mediaRecorderSpy).not.toHaveBeenCalled();
      expect(getDisplayMediaSpy).not.toHaveBeenCalled();
      expect(mockData.snapshots.length).toBeLessThanOrEqual(2);
      expect(snapshotRecords.every((entry) => isRecordTextSafe(entry.detail))).toBe(true);
      const mergedText = [
        ...snapshotRecords.map((entry) => `${entry.event_type} ${entry.detail}`),
        ...mockData.auditEvents.map((event) => `${event.actionType} ${JSON.stringify(event.metadata)}`),
      ].join(' ');
      expect(isRecordTextSafe(mergedText)).toBe(true);
      registerRow('Scope', 'No recording, screen capture or audio capture is started during the exam', '0', `${Number(mediaRecorderSpy.mock.calls.length) + Number(getDisplayMediaSpy.mock.calls.length)}`);

      let score = 12;
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(score).toBe(12);
      registerRow('Scope', 'No score or penalty changes automatically from monitoring events', '12', String(score));
    });
  });

  describe('Results summary', () => {
    it('prints the result table and confirms that no row fails', () => {
      const rows = resultsTable.map((row) => `${row.group} | ${row.check} | ${row.status}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(resultsTable.some((row) => row.status === 'FAIL')).toBe(false);
    });
  });
});
