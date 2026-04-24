import fs from 'fs';
import path from 'path';

const EVENTS_FILE = path.join(process.cwd(), 'events.json');
const MAX_EVENTS_IN_MEMORY = 5000;

let events = null;

function load() {
    if (events !== null) return;
    try {
        events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
    } catch {
        events = [];
    }
}

function save() {
    // Keep only the most recent MAX_EVENTS_IN_MEMORY events
    if (events.length > MAX_EVENTS_IN_MEMORY) {
        events = events.slice(events.length - MAX_EVENTS_IN_MEMORY);
    }
    const tmp = EVENTS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(events));
    fs.renameSync(tmp, EVENTS_FILE);
}

export function insertEvent({ cameraId, cameraName, label, confidence, screenshotPath }) {
    load();
    const now = Date.now();
    events.push({
        id: now,
        cameraId,
        cameraName,
        timestamp: now,
        label,
        confidence,
        screenshotPath: screenshotPath ?? null,
    });
    save();
}

export function getEvents({ cameraId, limit = 50, offset = 0 } = {}) {
    load();
    const filtered = cameraId ? events.filter(e => e.cameraId === cameraId) : events;
    const sorted = filtered.slice().sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(offset, offset + limit);
}

export function purgeOldEvents(maxAgeMs) {
    load();
    const cutoff = Date.now() - maxAgeMs;
    const before = events.length;
    events = events.filter(e => e.timestamp >= cutoff);
    if (events.length !== before) save();
}
