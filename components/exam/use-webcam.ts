'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WebcamMonitorEventType } from '@/lib/monitoring-events';

interface WebcamConfig {
  active: boolean;
  attemptId: string;
  maxSnapshots?: number;
  cooldownMs?: number;
  onEvent?: (eventType: WebcamMonitorEventType, detail: string) => void;
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Webcam frame was not ready for snapshot capture'));
    }, 5000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', checkReady);
      video.removeEventListener('canplay', checkReady);
      video.removeEventListener('resize', checkReady);
    };

    const checkReady = () => {
      if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        cleanup();
        resolve();
      }
    };

    video.addEventListener('loadeddata', checkReady);
    video.addEventListener('canplay', checkReady);
    video.addEventListener('resize', checkReady);
    checkReady();
  });
}

export function useWebcam({
  active,
  attemptId,
  maxSnapshots = 20,
  cooldownMs = 30000,
  onEvent,
}: WebcamConfig) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const deviceChangeHandlerRef = useRef<(() => void) | null>(null);
  const lastSnapshotRef = useRef<Record<string, number>>({});
  const pendingSnapshotRef = useRef(new Set<string>());
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function startWebcam() {
      try {
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia) {
          throw new Error('Camera access is unavailable in this browser');
        }
        const stream = await mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current && typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
          try {
            videoRef.current.srcObject = stream;
            const playback = videoRef.current.play?.();
            if (playback) void playback.catch((playbackError: unknown) => {
              if (!(playbackError instanceof DOMException && playbackError.name === 'AbortError')) {
                console.error('Unable to start webcam preview:', playbackError);
              }
            });
          } catch (previewError) {
            console.error('Unable to attach webcam preview:', previewError);
          }
        }

        stream.getVideoTracks().forEach((track) => {
          track.onmute = () => onEventRef.current?.('CAMERA_FEED_LOSS', 'Camera feed became unavailable during the examination');
          track.onunmute = () => onEventRef.current?.('CAMERA_FEED_RESTORED', 'Camera feed resumed');
          track.onended = () => {
            setHasPermission(false);
            onEventRef.current?.('CAMERA_FEED_LOSS', 'Camera feed ended during examination session');
          };
        });

        const activeVideoTrack = stream.getVideoTracks()[0];
        if (mediaDevices.enumerateDevices && activeVideoTrack) {
          try {
            const activeDeviceId = activeVideoTrack.getSettings().deviceId;
            const devices = await mediaDevices.enumerateDevices();
            if (devices.some((device) =>
              device.kind === 'videoinput'
              && device.deviceId === activeDeviceId
              && /virtual|obs|manycam|snap camera/i.test(device.label))) {
              onEventRef.current?.('VIRTUAL_CAMERA_DETECTED', 'The active camera device is identified as a virtual camera');
            }
          } catch (deviceError) {
            console.error('Unable to inspect available camera devices:', deviceError);
          }
        }

        setHasPermission(true);

        try {
          const microphoneStream = await mediaDevices.getUserMedia({ video: false, audio: true });
          if (cancelled) {
            microphoneStream.getTracks().forEach((track) => track.stop());
            return;
          }
          const audioTracks = typeof microphoneStream.getAudioTracks === 'function'
            ? microphoneStream.getAudioTracks()
            : [];
          if (typeof microphoneStream.getAudioTracks !== 'function') {
            console.error('Microphone stream does not expose audio tracks.');
          } else if (audioTracks.length === 0) {
            microphoneStream.getTracks().forEach((track) => track.stop());
            onEventRef.current?.('MICROPHONE_PERMISSION_DENIED', 'No microphone audio track is available');
          } else {
            microphoneStreamRef.current = microphoneStream;
            audioTracks.forEach((track) => {
              track.onmute = () => onEventRef.current?.('MICROPHONE_FEED_LOSS', 'Microphone feed became unavailable during the examination');
              track.onunmute = () => onEventRef.current?.('MICROPHONE_FEED_RESTORED', 'Microphone feed resumed');
              track.onended = () => onEventRef.current?.('MICROPHONE_FEED_LOSS', 'Microphone feed ended during examination session');
            });
          }
        } catch {
          if (!cancelled) {
            onEventRef.current?.('MICROPHONE_PERMISSION_DENIED', 'Microphone permission denied or unavailable');
          }
        }

        if (mediaDevices.enumerateDevices) {
          let cameraDeviceMissing = false;
          let microphoneDeviceMissing = false;
          const handleDeviceChange = () => {
            void mediaDevices.enumerateDevices!().then((devices) => {
              const videoDeviceId = activeVideoTrack?.getSettings().deviceId;
              if (videoDeviceId) {
                const missing = !devices.some((device) =>
                  device.kind === 'videoinput' && device.deviceId === videoDeviceId);
                if (missing !== cameraDeviceMissing) {
                  cameraDeviceMissing = missing;
                  onEventRef.current?.(
                    missing ? 'CAMERA_FEED_LOSS' : 'CAMERA_FEED_RESTORED',
                    missing ? 'The active camera was disconnected' : 'The active camera was reconnected',
                  );
                }
              }
              const audioTrack = microphoneStreamRef.current?.getAudioTracks()[0];
              const audioDeviceId = audioTrack?.getSettings().deviceId;
              if (audioDeviceId) {
                const missing = !devices.some((device) =>
                  device.kind === 'audioinput' && device.deviceId === audioDeviceId);
                if (missing !== microphoneDeviceMissing) {
                  microphoneDeviceMissing = missing;
                  onEventRef.current?.(
                    missing ? 'MICROPHONE_FEED_LOSS' : 'MICROPHONE_FEED_RESTORED',
                    missing ? 'The active microphone was disconnected' : 'The active microphone was reconnected',
                  );
                }
              }
            }).catch((deviceError: unknown) => {
              console.error('Unable to verify exam media devices:', deviceError);
            });
          };
          deviceChangeHandlerRef.current = handleDeviceChange;
          mediaDevices.addEventListener?.('devicechange', handleDeviceChange);
        }
      } catch {
        setHasPermission(false);
        onEventRef.current?.('CAMERA_PERMISSION_DENIED', 'Camera permission denied or unavailable');
      }
    }

    startWebcam();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks?.()?.forEach?.((t: any) => t?.stop?.());
      microphoneStreamRef.current?.getTracks?.()?.forEach?.((track) => track.stop());
      if (deviceChangeHandlerRef.current) {
        navigator.mediaDevices?.removeEventListener?.('devicechange', deviceChangeHandlerRef.current);
        deviceChangeHandlerRef.current = null;
      }
      streamRef.current = null;
      microphoneStreamRef.current = null;
    };
  }, [active]);

  const captureSnapshot = useCallback(async (trigger: string) => {
    if (snapshotCount >= maxSnapshots) return;
    const now = Date.now();
    const lastOfType = lastSnapshotRef.current[trigger] ?? 0;
    if (now - lastOfType < cooldownMs) return;
    if (pendingSnapshotRef.current.has(trigger)) return;
    pendingSnapshotRef.current.add(trigger);

    try {
      const video = videoRef.current;
      if (!video) throw new Error('Webcam video element is unavailable');
      await waitForVideoFrame(video);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create a canvas for snapshot capture');
      ctx.drawImage(video, 0, 0, 320, 240);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

      const eventResponse = await fetch('/api/monitoring/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, eventType: trigger, detail: 'Snapshot trigger captured by browser monitor' }),
      });
      if (!eventResponse.ok) throw new Error(`Snapshot event request failed (${eventResponse.status})`);
      const event = await eventResponse.json();
      const snapshotResponse = await fetch('/api/monitoring/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, eventId: event.id, trigger, imageData: dataUrl }),
      });
      if (!snapshotResponse.ok) throw new Error(`Snapshot save request failed (${snapshotResponse.status})`);
      lastSnapshotRef.current[trigger] = Date.now();
      setSnapshotCount(c => c + 1);
    } catch (e) {
      console.error('Snapshot failed:', e);
    } finally {
      pendingSnapshotRef.current.delete(trigger);
    }
  }, [attemptId, snapshotCount, maxSnapshots, cooldownMs]);

  return { videoRef, hasPermission, snapshotCount, captureSnapshot };
}
