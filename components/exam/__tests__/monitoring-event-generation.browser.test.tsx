import { createElement, useCallback, useState } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { useBrowserMonitor } from '@/components/exam/use-browser-monitor';
import { useWebcam } from '@/components/exam/use-webcam';
import {
  BROWSER_MONITOR_EVENT_TYPES,
  MONITORING_EVENT_TYPES,
  type BrowserMonitorEventType,
  type MonitoringEventType,
} from '@/lib/monitoring-events';

const h = createElement;
const START_TIME = new Date('2026-10-11T19:00:00.000Z');

type MonitoringRecord = {
  event_type: MonitoringEventType;
  timestamp: string;
  attempt_id: string;
  candidate_id: string;
  detail: string;
};

type MonitorFixtureProps = {
  attemptId: string;
  candidateId: string;
  webcamActive?: boolean;
  onRecord: (record: MonitoringRecord) => void;
};

type SyntheticWebcamTrack = {
  onended: (() => void) | null;
  onmute?: (() => void) | null;
  onunmute?: (() => void) | null;
  stop: () => void;
  getSettings?: () => MediaTrackSettings;
};

function MonitorFixture({
  attemptId,
  candidateId,
  webcamActive = false,
  onRecord,
}: MonitorFixtureProps) {
  const [records, setRecords] = useState<MonitoringRecord[]>([]);

  const recordEvent = useCallback((eventType: MonitoringEventType, detail: string) => {
    if (!attemptId || !candidateId) return;

    const record: MonitoringRecord = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      attempt_id: attemptId,
      candidate_id: candidateId,
      detail,
    };
    onRecord(record);
    setRecords((current) => [...current, record]);
  }, [attemptId, candidateId, onRecord]);

  useBrowserMonitor(true, recordEvent);
  useWebcam({ active: webcamActive, attemptId, onEvent: recordEvent });

  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        padding: '56px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: '"Times New Roman", Times, serif',
      },
    },
    h(
      'header',
      { style: { maxWidth: '1080px', margin: '0 auto 32px' } },
      h('div', { style: { fontSize: '12px', letterSpacing: '0.12em' } }, 'BINGHAM UNIVERSITY'),
      h('h1', { style: { margin: '8px 0', fontSize: '30px' } }, 'Monitoring event log'),
      h('p', { style: { margin: 0 } }, 'Invigilator view · Browser and session events'),
    ),
    h(
      'section',
      {
        style: {
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '28px',
          border: '1px solid #000000',
          background: '#ffffff',
        },
      },
      h('h2', { style: { margin: '0 0 6px', fontSize: '20px' } }, 'Candidate activity'),
      h('p', { style: { margin: '0 0 20px' } }, `Attempt ${attemptId} · Candidate ${candidateId}`),
      h(
        'table',
        { style: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' } },
        h('thead', null, h('tr', { style: { borderBottom: '1px solid #000000' } },
          h('th', { style: { padding: '12px 8px' } }, 'Event'),
          h('th', { style: { padding: '12px 8px' } }, 'Timestamp'),
          h('th', { style: { padding: '12px 8px' } }, 'Candidate'),
          h('th', { style: { padding: '12px 8px' } }, 'Details'),
        )),
        h(
          'tbody',
          { 'data-testid': 'monitoring-records' },
          records.map((record, index) => h('tr', {
            key: `${record.event_type}-${index}`,
            style: { borderBottom: '1px solid #000000' },
          },
          h('td', { 'data-testid': 'event-type', style: { padding: '12px 8px' } }, record.event_type),
          h('td', { 'data-testid': 'event-timestamp', style: { padding: '12px 8px' } }, record.timestamp),
          h('td', { 'data-testid': 'event-candidate', style: { padding: '12px 8px' } }, record.candidate_id),
          h('td', { style: { padding: '12px 8px' } }, record.detail),
          )),
        ),
      ),
      records.length === 0
        ? h('p', { 'data-testid': 'empty-feed', style: { marginBottom: 0 } }, 'No events recorded.')
        : null,
    ),
  );
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function isBrowserMonitorEventType(eventType: MonitoringEventType): eventType is BrowserMonitorEventType {
  return (BROWSER_MONITOR_EVENT_TYPES as readonly MonitoringEventType[]).includes(eventType);
}

function browserStimuli(): Record<BrowserMonitorEventType, () => Promise<void>> {
  return {
    BACK_NAVIGATION: async () => {
      window.dispatchEvent(new Event('popstate'));
    },
    INTENTIONAL_NAVIGATION: async () => {
      const link = document.createElement('a');
      link.href = `${window.location.origin}/another-exam-route`;
      document.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
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
      document.dispatchEvent(new Event('contextmenu'));
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
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
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

describe('Unit Test 15 — Monitoring-event record generation', () => {
  const attemptId = 'attempt-test-1501';
  const candidateId = 'candidate-test-1501';
  let rendered: Awaited<ReturnType<typeof render>> | undefined;
  let restoreMediaDevices: (() => void) | undefined;
  let originalHidden: PropertyDescriptor | undefined;
  let originalInnerWidth: PropertyDescriptor | undefined;
  let originalInnerHeight: PropertyDescriptor | undefined;
  let originalScreenExtended: PropertyDescriptor | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    originalScreenExtended = Object.getOwnPropertyDescriptor(window.screen, 'isExtended');
    await page.viewport(1440, 1000);
    rendered = await render(h(MonitorFixture, {
      attemptId,
      candidateId,
      onRecord: vi.fn(),
    }));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    restoreMediaDevices?.();
    restoreMediaDevices = undefined;
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else Reflect.deleteProperty(document, 'hidden');
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    else Reflect.deleteProperty(window, 'innerWidth');
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    else Reflect.deleteProperty(window, 'innerHeight');
    if (originalScreenExtended) Object.defineProperty(window.screen, 'isExtended', originalScreenExtended);
    else Reflect.deleteProperty(window.screen, 'isExtended');
    vi.useRealTimers();
  });

  it.each(MONITORING_EVENT_TYPES)(
    'records %s with its event type, valid timestamp, attempt, and candidate',
    async (eventType) => {
      const records: MonitoringRecord[] = [];
      const onRecord = (record: MonitoringRecord) => records.push(record);
      await rendered?.rerender(h(MonitorFixture, {
        attemptId,
        candidateId,
        onRecord,
      }));

      const before = Date.now();
      if (isBrowserMonitorEventType(eventType)) {
        await browserStimuli()[eventType]();
      } else {
        const track: SyntheticWebcamTrack = {
          onended: null,
          onmute: null,
          onunmute: null,
          stop: vi.fn(),
          getSettings: () => ({ deviceId: 'test-camera' }),
        };
        const audioTrack: SyntheticWebcamTrack = {
          onended: null,
          onmute: null,
          onunmute: null,
          stop: vi.fn(),
        };
        const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

        const videoStream = {
          getTracks: () => [track],
          getVideoTracks: () => [track],
          getAudioTracks: () => [],
        } as unknown as MediaStream;
        const audioStream = {
          getTracks: () => [audioTrack],
          getVideoTracks: () => [],
          getAudioTracks: () => [audioTrack],
        } as unknown as MediaStream;
        const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
          if (eventType === 'CAMERA_PERMISSION_DENIED' && constraints.video) {
            throw new Error('Camera permission denied');
          }
          if (eventType === 'MICROPHONE_PERMISSION_DENIED' && constraints.audio) {
            throw new Error('Microphone permission denied');
          }
          return constraints.audio ? audioStream : videoStream;
        });
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia,
            enumerateDevices: vi.fn(async () => [{
              kind: 'videoinput',
              deviceId: 'test-camera',
              label: eventType === 'VIRTUAL_CAMERA_DETECTED' ? 'OBS Virtual Camera' : 'Test camera',
            }]),
          },
        });
        restoreMediaDevices = () => {
          if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
          else Reflect.deleteProperty(navigator, 'mediaDevices');
        };

        await rendered?.rerender(h(MonitorFixture, {
          attemptId,
          candidateId,
          webcamActive: true,
          onRecord,
        }));
        await vi.advanceTimersByTimeAsync(0);
        if (eventType === 'CAMERA_FEED_LOSS' || eventType === 'CAMERA_FEED_RESTORED') {
          await vi.waitFor(() => expect(track.onended).toBeTypeOf('function'));
          if (eventType === 'CAMERA_FEED_LOSS') track.onended?.();
          else track.onunmute?.();
        } else if (eventType === 'MICROPHONE_FEED_LOSS' || eventType === 'MICROPHONE_FEED_RESTORED') {
          await vi.waitFor(() => expect(audioTrack.onended).toBeTypeOf('function'));
          if (eventType === 'MICROPHONE_FEED_LOSS') audioTrack.onended?.();
          else audioTrack.onunmute?.();
        } else {
          await vi.waitFor(() => expect(records.some((record) => record.event_type === eventType)).toBe(true));
        }
      }
      const after = Date.now();

      const record = records.find((entry) => entry.event_type === eventType);
      expect(record).toBeDefined();
      expect(record?.event_type).toBe(eventType);
      expect(Date.parse(record?.timestamp ?? '')).not.toBeNaN();
      expect(Date.parse(record?.timestamp ?? '')).toBeGreaterThanOrEqual(before);
      expect(Date.parse(record?.timestamp ?? '')).toBeLessThanOrEqual(after);
      expect(record?.attempt_id).toBe(attemptId);
      expect(record?.candidate_id).toBe(candidateId);
    },
  );

  it('keeps the identifiers attached to the candidate that fired the event', async () => {
    const firstRecords: MonitoringRecord[] = [];
    const secondRecords: MonitoringRecord[] = [];
    const first = await render(h(MonitorFixture, {
      attemptId: 'attempt-first',
      candidateId: 'candidate-first',
      onRecord: (record: MonitoringRecord) => firstRecords.push(record),
    }));
    const second = await render(h(MonitorFixture, {
      attemptId: 'attempt-second',
      candidateId: 'candidate-second',
      onRecord: (record: MonitoringRecord) => secondRecords.push(record),
    }));

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(firstRecords).toHaveLength(1);
    expect(secondRecords).toHaveLength(1);
    expect(firstRecords[0]).toMatchObject({ attempt_id: 'attempt-first', candidate_id: 'candidate-first' });
    expect(secondRecords[0]).toMatchObject({ attempt_id: 'attempt-second', candidate_id: 'candidate-second' });
    expect(firstRecords[0].candidate_id).not.toBe(secondRecords[0].candidate_id);
    await first.unmount();
    await second.unmount();
  });

  it('creates distinct timestamped records when the same event fires twice', async () => {
    const records: MonitoringRecord[] = [];
    await rendered?.rerender(h(MonitorFixture, {
      attemptId,
      candidateId,
      onRecord: (record: MonitoringRecord) => records.push(record),
    }));

    document.dispatchEvent(new Event('fullscreenchange'));
    await vi.advanceTimersByTimeAsync(1000);
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(records).toHaveLength(2);
    expect(records[0].event_type).toBe('FULLSCREEN_EXIT');
    expect(records[1].event_type).toBe('FULLSCREEN_EXIT');
    expect(records[0].timestamp).not.toBe(records[1].timestamp);
  });

  it('ignores browser events that are not in the shared event list', async () => {
    const onRecord = vi.fn();
    await rendered?.rerender(h(MonitorFixture, { attemptId, candidateId, onRecord }));

    document.dispatchEvent(new Event('synthetic_unknown_browser_event'));

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('does not create records when attempt or candidate identifiers are missing', async () => {
    const onRecord = vi.fn();
    await rendered?.rerender(h(MonitorFixture, {
      attemptId: '',
      candidateId: '',
      onRecord,
    }));

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('blocks editable-field clipboard actions, context menus, and developer-tools shortcuts', async () => {
    const records: MonitoringRecord[] = [];
    await rendered?.rerender(h(MonitorFixture, {
      attemptId,
      candidateId,
      onRecord: (record: MonitoringRecord) => records.push(record),
    }));
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    for (const eventType of ['copy', 'cut', 'paste']) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented, `${eventType} should be blocked in response fields`).toBe(true);
    }
    input.remove();

    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);

    const shortcuts = [
      new KeyboardEvent('keydown', { key: 'F12', cancelable: true }),
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, shiftKey: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: 'i', metaKey: true, altKey: true, cancelable: true }),
    ];
    shortcuts.forEach((event) => {
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
    expect(records.filter((record) => record.event_type === 'KEYBOARD_SHORTCUT')).toHaveLength(3);
  });

  it('shows event names, timestamps, and candidates in the invigilator monitoring feed', async () => {
    const onRecord = vi.fn();
    await rendered?.rerender(h(MonitorFixture, { attemptId, candidateId, onRecord }));
    document.dispatchEvent(new Event('fullscreenchange'));
    await vi.advanceTimersByTimeAsync(1000);
    document.dispatchEvent(new Event('copy'));
    await vi.advanceTimersByTimeAsync(1000);
    document.dispatchEvent(new Event('paste'));

    await expect.element(page.getByRole('heading', { name: 'Monitoring event log' })).toBeVisible();
    await expect.element(page.getByTestId('event-type').nth(0)).toHaveTextContent('FULLSCREEN_EXIT');
    await expect.element(page.getByTestId('event-type').nth(1)).toHaveTextContent('COPY_ATTEMPT');
    await expect.element(page.getByTestId('event-type').nth(2)).toHaveTextContent('PASTE_ATTEMPT');
    await expect.element(page.getByTestId('event-timestamp').nth(0)).toHaveTextContent(START_TIME.toISOString());
    await expect.element(page.getByTestId('event-candidate').nth(0)).toHaveTextContent(candidateId);
    await expect.element(page.getByTestId('event-candidate').nth(1)).toHaveTextContent(candidateId);
    await expect.element(page.getByTestId('event-candidate').nth(2)).toHaveTextContent(candidateId);

    await expect(page).toMatchScreenshot('unit-test-15-monitoring-events/scenario-specific-ui-screenshots/monitoring-event-feed');
  });
});
