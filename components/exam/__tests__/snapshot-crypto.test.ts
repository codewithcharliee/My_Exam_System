import { afterEach, describe, expect, it } from 'vitest';
import { decryptSnapshot, encryptSnapshot } from '@/lib/snapshot-crypto';

const originalEncryptionKey = process.env.SNAPSHOT_ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.SNAPSHOT_ENCRYPTION_KEY;
  } else {
    process.env.SNAPSHOT_ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe('snapshot encryption', () => {
  it('encrypts snapshot data and restores it with the configured key', () => {
    process.env.SNAPSHOT_ENCRYPTION_KEY = 'snapshot-crypto-unit-test-key';
    const imageData = 'data:image/jpeg;base64,dGVzdA==';

    const encrypted = encryptSnapshot(imageData);

    expect(encrypted).not.toBe(imageData);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptSnapshot(encrypted)).toBe(imageData);
  });

  it('fails explicitly when no encryption key is configured', () => {
    delete process.env.SNAPSHOT_ENCRYPTION_KEY;

    expect(() => encryptSnapshot('data:image/jpeg;base64,dGVzdA==')).toThrow(
      'SNAPSHOT_ENCRYPTION_KEY is not configured',
    );
  });
});
