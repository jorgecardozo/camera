#!/usr/bin/env node
// Migrates cameras.json and events.json to the Prisma SQLite database.
// Run once: node scripts/migrate-json-to-db.js
// Safe to re-run: uses INSERT OR IGNORE for cameras, skips duplicate events.

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createCipheriv, randomBytes } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const CAMERAS_FILE = join(ROOT, 'cameras.json');
const EVENTS_FILE  = join(ROOT, 'events.json');

// Load env vars
const { config } = await import('dotenv');
config({ path: join(ROOT, '.env.local') });
config({ path: join(ROOT, '.env') });

const Database = require('better-sqlite3');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY || '';

function encryptCredentials({ username, password }) {
    if (!KEY_HEX || KEY_HEX.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-char hex string. Check .env.local');
    }
    const key = Buffer.from(KEY_HEX, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plain = JSON.stringify({ username, password });
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

const LOCAL_USER_ID = 'local';
const DB_URL = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const DB_PATH = DB_URL.startsWith('file:') ? join(ROOT, DB_URL.slice(5)) : join(ROOT, DB_URL);

const db = new Database(DB_PATH);
db.defaultSafeIntegers(true);

// Ensure local user exists
db.prepare(`
    INSERT OR IGNORE INTO User (id, email, name, password, createdAt)
    VALUES (?, ?, ?, ?, ?)
`).run(LOCAL_USER_ID, 'local@localhost', 'Local User', 'local', new Date().toISOString());
console.log('✓ Local user ensured');

// Migrate cameras
if (existsSync(CAMERAS_FILE)) {
    const cameras = JSON.parse(readFileSync(CAMERAS_FILE, 'utf-8'));
    let inserted = 0;
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO Camera
            (id, userId, name, ip, port, httpPort, rtspPath, credentialsEncrypted,
             continuousRecord, motionDetect, motionSensitivity,
             telegramBotToken, telegramChatId, telegramEnabled, notifyObjects, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cam of cameras) {
        const { username = '', password = '' } = cam;
        const credentialsEncrypted = (username || password)
            ? encryptCredentials({ username, password })
            : '';
        const result = stmt.run(
            cam.id, LOCAL_USER_ID, cam.name, cam.ip,
            cam.port || 554, cam.httpPort || 80, cam.rtspPath || '/live',
            credentialsEncrypted,
            cam.continuousRecord ? 1 : 0,
            cam.motionDetect ? 1 : 0,
            cam.motionSensitivity ?? 0.12,
            cam.telegramBotToken || '',
            cam.telegramChatId || '',
            cam.telegramEnabled ? 1 : 0,
            cam.notifyObjects || null,
            new Date().toISOString(),
        );
        if (result.changes > 0) inserted++;
    }
    console.log(`✓ Cameras migrated: ${inserted} inserted (${cameras.length - inserted} already existed)`);
} else {
    console.log('– cameras.json not found, skipping');
}

// Migrate events
if (existsSync(EVENTS_FILE)) {
    const events = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'));
    const cameraIds = new Set(
        db.prepare('SELECT id FROM Camera').all().map(r => r.id)
    );

    const insertEvent = db.prepare(`
        INSERT OR IGNORE INTO Event (id, cameraId, userId, timestamp, label, confidence, screenshotPath)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((evList) => {
        let inserted = 0, skipped = 0;
        for (const ev of evList) {
            if (!cameraIds.has(ev.cameraId)) { skipped++; continue; }
            // Use cameraId+timestamp as a stable ID
            const stableId = `migrated_${ev.cameraId}_${ev.timestamp}`;
            const result = insertEvent.run(
                stableId, ev.cameraId, LOCAL_USER_ID,
                BigInt(ev.timestamp),
                ev.label || 'unknown',
                ev.confidence ?? 0,
                ev.screenshotPath ?? null,
            );
            if (result.changes > 0) inserted++; else skipped++;
        }
        return { inserted, skipped };
    });

    const { inserted, skipped } = insertMany(events);
    console.log(`✓ Events migrated: ${inserted} inserted, ${skipped} skipped`);
} else {
    console.log('– events.json not found, skipping');
}

db.close();
console.log('\nMigración completa.');
