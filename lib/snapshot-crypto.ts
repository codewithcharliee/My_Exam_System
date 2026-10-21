import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const secret = process.env.SNAPSHOT_ENCRYPTION_KEY;
  if (!secret) throw new Error('SNAPSHOT_ENCRYPTION_KEY is not configured');
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSnapshot(imageData: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(imageData, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSnapshot(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.slice(PREFIX.length).split(':');
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Invalid encrypted snapshot');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivEncoded, 'base64'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64')), decipher.final()]).toString('utf8');
}
