import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY || '';

function getKey() {
    if (!KEY_HEX || KEY_HEX.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32');
    }
    return Buffer.from(KEY_HEX, 'hex');
}

export function encryptCredentials({ username, password }) {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plain = JSON.stringify({ username, password });
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv(12) + tag(16) + ciphertext, all hex-encoded
    return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

export function decryptCredentials(encryptedHex) {
    if (!encryptedHex) return { username: '', password: '' };
    try {
        const key = getKey();
        const buf = Buffer.from(encryptedHex, 'hex');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const ciphertext = buf.subarray(28);
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        const plain = decipher.update(ciphertext) + decipher.final('utf8');
        return JSON.parse(plain);
    } catch {
        return { username: '', password: '' };
    }
}
