'use client';

const DB_NAME = 'bingham_exam_db';
const DB_VERSION = 1;
const STORE_NAME = 'responses';
const writeSequenceByAttempt = new Map<string, number>();

export type LocalResponseCache = {
  candidateId: string;
  responses: Record<string, unknown>;
  flagged: string[];
  timestamp: number;
  currentIndex?: number;
  responseTimestamps?: Record<string, number>;
  timeSpentSecs?: Record<string, number>;
  visitCount?: Record<string, number>;
  answerChanges?: Record<string, number>;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
  });
}

export async function deriveCredentialKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAndStore(
  attemptId: string,
  password: string,
  candidateId: string,
  data: Omit<LocalResponseCache, 'candidateId'>,
): Promise<void> {
  const writeSequence = (writeSequenceByAttempt.get(attemptId) ?? 0) + 1;
  writeSequenceByAttempt.set(attemptId, writeSequence);
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveCredentialKey(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify({ ...data, candidateId })),
    );
    const db = await openDB();
    if (writeSequenceByAttempt.get(attemptId) !== writeSequence) {
      db.close();
      return;
    }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ key: attemptId, salt: Array.from(salt), iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)), timestamp: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.error('Encrypt/store failed:', error);
  }
}

export async function decryptAndLoad(
  attemptId: string,
  password: string,
  candidateId: string,
): Promise<LocalResponseCache | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(attemptId);
    const record: unknown = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record || typeof record !== 'object') return null;
    const storedRecord = record as Record<string, unknown>;
    if (!Array.isArray(storedRecord.salt) || !Array.isArray(storedRecord.iv) || !Array.isArray(storedRecord.data)) return null;
    const key = await deriveCredentialKey(password, new Uint8Array(storedRecord.salt as number[]));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(storedRecord.iv as number[]) },
      key,
      new Uint8Array(storedRecord.data as number[]),
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (!parsed || typeof parsed !== 'object') return null;
    const cache = parsed as Record<string, unknown>;
    if (
      cache.candidateId !== candidateId
      || !cache.responses
      || typeof cache.responses !== 'object'
      || !Array.isArray(cache.flagged)
      || typeof cache.timestamp !== 'number'
    ) return null;
    return {
      candidateId,
      responses: cache.responses as Record<string, unknown>,
      flagged: cache.flagged.filter((id): id is string => typeof id === 'string'),
      timestamp: cache.timestamp,
      ...(typeof cache.currentIndex === 'number' ? { currentIndex: cache.currentIndex } : {}),
      ...(cache.responseTimestamps && typeof cache.responseTimestamps === 'object'
        ? { responseTimestamps: cache.responseTimestamps as Record<string, number> }
        : {}),
      ...(cache.timeSpentSecs && typeof cache.timeSpentSecs === 'object'
        ? { timeSpentSecs: cache.timeSpentSecs as Record<string, number> }
        : {}),
      ...(cache.visitCount && typeof cache.visitCount === 'object'
        ? { visitCount: cache.visitCount as Record<string, number> }
        : {}),
      ...(cache.answerChanges && typeof cache.answerChanges === 'object'
        ? { answerChanges: cache.answerChanges as Record<string, number> }
        : {}),
    };
  } catch (error) {
    console.error('Decrypt/load failed:', error);
    return null;
  }
}

export async function clearStored(attemptId: string): Promise<void> {
  writeSequenceByAttempt.set(attemptId, (writeSequenceByAttempt.get(attemptId) ?? 0) + 1);
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(attemptId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.error('Clear stored failed:', error);
  }
}
