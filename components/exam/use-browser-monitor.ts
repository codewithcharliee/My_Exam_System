'use client';

import { useEffect, useRef } from 'react';
import type { BrowserMonitorEventType } from '@/lib/monitoring-events';

type EventCallback = (eventType: BrowserMonitorEventType, detail: string) => void;

export function useBrowserMonitor(active: boolean, onEvent: EventCallback) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!active) return;
    const handlers: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];
    let focusEventTimer: ReturnType<typeof setTimeout> | undefined;
    let pageHiding = false;
    let hasBeenHidden = false;
    let hasLostWindowFocus = false;

    function addHandler(target: EventTarget, event: string, handler: EventListener) {
      target.addEventListener(event, handler);
      handlers.push({ target, event, handler });
    }

    const examUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const guardedHistoryState = {
      ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
      examNavigationGuard: true,
    };
    window.history.pushState(guardedHistoryState, '', examUrl);

    addHandler(window, 'popstate', () => {
      onEventRef.current?.('BACK_NAVIGATION', 'Candidate attempted to navigate back during the exam');
      window.history.pushState(
        { ...(window.history.state ?? {}), examNavigationGuard: true },
        '',
        examUrl,
      );
    });

    addHandler(document, 'click', (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0 || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) return;

      const link = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname) return;

      event.preventDefault();
      onEventRef.current?.('INTENTIONAL_NAVIGATION', destination.href);
    });

    addHandler(document, 'visibilitychange', () => {
      if (document.hidden) {
        if (focusEventTimer) clearTimeout(focusEventTimer);
        focusEventTimer = setTimeout(() => {
          focusEventTimer = undefined;
          if (!pageHiding && document.hidden) {
            hasBeenHidden = true;
            onEventRef.current?.('TAB_SWITCH', 'Candidate switched away from exam tab');
          }
        }, 250);
      } else {
        if (focusEventTimer) clearTimeout(focusEventTimer);
        focusEventTimer = undefined;
        if (hasBeenHidden) {
          hasBeenHidden = false;
          onEventRef.current?.('TAB_RETURN', 'Candidate returned to exam tab');
        }
      }
    });

    addHandler(window, 'pagehide', () => {
      pageHiding = true;
      if (focusEventTimer) clearTimeout(focusEventTimer);
      focusEventTimer = undefined;
    });

    addHandler(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement) {
        onEventRef.current?.('FULLSCREEN_EXIT', 'Candidate exited fullscreen mode');
      }
    });

    const screenWithExtension = window.screen as Screen & { isExtended?: boolean };
    let extendedDisplayReported = false;
    const reportExtendedDisplay = () => {
      if (screenWithExtension.isExtended && !extendedDisplayReported) {
        extendedDisplayReported = true;
        onEventRef.current?.('MULTI_DISPLAY_DETECTED', 'Browser reports an extended display configuration');
      } else if (!screenWithExtension.isExtended) {
        extendedDisplayReported = false;
      }
    };
    reportExtendedDisplay();
    addHandler(window.screen as Screen & EventTarget, 'change', reportExtendedDisplay);
    const displayPoll = window.setInterval(reportExtendedDisplay, 3000);

    // Copy/paste/cut
    const handleClipboard = (event: Event, eventType: 'COPY_ATTEMPT' | 'CUT_ATTEMPT' | 'PASTE_ATTEMPT') => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) {
        event.preventDefault();
      }
      const action = eventType === 'COPY_ATTEMPT' ? 'Copy' : eventType === 'CUT_ATTEMPT' ? 'Cut' : 'Paste';
      onEventRef.current?.(eventType, `${action} action detected`);
    };

    addHandler(document, 'copy', (event) => handleClipboard(event, 'COPY_ATTEMPT'));
    addHandler(document, 'paste', (event) => handleClipboard(event, 'PASTE_ATTEMPT'));
    addHandler(document, 'cut', (event) => handleClipboard(event, 'CUT_ATTEMPT'));

    addHandler(document, 'contextmenu', (event) => {
      event.preventDefault();
      onEventRef.current?.('RIGHT_CLICK', 'Right-click context menu opened');
    });

    // Window blur/focus
    addHandler(window, 'blur', () => {
      if (document.hidden) return;
      if (focusEventTimer) clearTimeout(focusEventTimer);
      focusEventTimer = setTimeout(() => {
        focusEventTimer = undefined;
        if (!pageHiding && !document.hidden) {
          hasLostWindowFocus = true;
          onEventRef.current?.('WINDOW_BLUR', 'Window lost focus');
        }
      }, 250);
    });
    addHandler(window, 'focus', () => {
      if (focusEventTimer) clearTimeout(focusEventTimer);
      focusEventTimer = undefined;
      if (hasLostWindowFocus) {
        hasLostWindowFocus = false;
        onEventRef.current?.('WINDOW_FOCUS', 'Window regained focus');
      }
    });

    addHandler(document, 'keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'PrintScreen') {
        onEventRef.current?.('PRINT_SCREEN', 'Print screen key pressed');
      }
      const key = ke.key?.toLowerCase?.();
      const inspectShortcut = ke.key === 'F12'
        || ((ke.ctrlKey || ke.metaKey) && ke.shiftKey && key === 'i')
        || (ke.metaKey && ke.altKey && key === 'i');
      if (inspectShortcut) {
        ke.preventDefault();
        onEventRef.current?.('KEYBOARD_SHORTCUT', 'Developer tools shortcut intercepted');
        return;
      }
      if ((ke.ctrlKey || ke.metaKey) && key === 'v') ke.preventDefault();
      if ((ke.ctrlKey || ke.metaKey) && ['p', 'a', 's', 'v'].includes(key)) {
        onEventRef.current?.('KEYBOARD_SHORTCUT', `Shortcut used: ${ke.ctrlKey ? 'Ctrl' : 'Cmd'}+${ke.key}`);
      }
    });

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    let lastOuterWidth = window.outerWidth;
    let lastOuterHeight = window.outerHeight;
    addHandler(window, 'resize', () => {
      const widthDiff = Math.abs(window.innerWidth - lastWidth);
      const heightDiff = Math.abs(window.innerHeight - lastHeight);
      const dockedToolsGap = Math.max(
        window.outerWidth - window.innerWidth,
        window.outerHeight - window.innerHeight,
      );
      const previousGap = Math.max(
        lastOuterWidth - lastWidth,
        lastOuterHeight - lastHeight,
      );
      if ((widthDiff > 200 || heightDiff > 200) && dockedToolsGap - previousGap > 160) {
        onEventRef.current?.('DEVTOOLS_TAMPERING', 'Window layout changed in a way consistent with docked developer tools');
      } else if (widthDiff > 200 || heightDiff > 200) {
        onEventRef.current?.('SUSPICIOUS_RESIZE', `Window resized significantly: ${widthDiff}x${heightDiff}`);
      }
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      lastOuterWidth = window.outerWidth;
      lastOuterHeight = window.outerHeight;
    });

    return () => {
      if (focusEventTimer) clearTimeout(focusEventTimer);
      window.clearInterval(displayPoll);
      handlers.forEach(({ target, event, handler }) => target.removeEventListener(event, handler));
    };
  }, [active]);
}
