import fs from 'fs';
import path from 'path';
import { purgeOldEvents } from './event-store.js';

const RECORDINGS_DIR = path.join(process.cwd(), 'public', 'recordings');
const MAX_AGE_HOURS = parseInt(process.env.MAX_RECORDING_AGE_HOURS || '72', 10);
const MAX_SIZE_GB = parseFloat(process.env.MAX_RECORDINGS_GB || '10');

function getRecordingFiles() {
    if (!fs.existsSync(RECORDINGS_DIR)) return [];
    return fs.readdirSync(RECORDINGS_DIR)
        .filter(f => f.endsWith('.mp4'))
        .map(f => {
            const full = path.join(RECORDINGS_DIR, f);
            const stats = fs.statSync(full);
            return { name: f, full, size: stats.size, mtime: stats.mtimeMs };
        })
        .sort((a, b) => a.mtime - b.mtime); // oldest first
}

function tryDelete(file, reason) {
    try {
        fs.unlinkSync(file.full);
        console.log(`[retention] deleted ${file.name} (${reason})`);
    } catch (err) {
        console.error(`[retention] failed to delete ${file.name}: ${err.message}`);
    }
}

export async function cleanOldRecordings() {
    // Purge old motion events using the same age window as recordings
    try {
        const maxAgeMs = MAX_AGE_HOURS * 3_600_000;
        await purgeOldEvents(maxAgeMs);
    } catch (err) {
        console.error('[retention] failed to purge events:', err.message);
    }

    if (!fs.existsSync(RECORDINGS_DIR)) return;

    let files = getRecordingFiles();

    // Age-based cleanup
    if (MAX_AGE_HOURS > 0) {
        const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;
        for (const file of files) {
            if (file.mtime < cutoff) tryDelete(file, `older than ${MAX_AGE_HOURS}h`);
        }
        files = getRecordingFiles(); // re-read after deletions
    }

    // Size-based cleanup
    const maxBytes = MAX_SIZE_GB * 1_073_741_824;
    let totalBytes = files.reduce((s, f) => s + f.size, 0);
    for (const file of files) {
        if (totalBytes <= maxBytes) break;
        tryDelete(file, `over ${MAX_SIZE_GB} GB limit`);
        totalBytes -= file.size;
    }
}

export function getRetentionStatus() {
    const files = getRecordingFiles();
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    return {
        count: files.length,
        totalGB: +(totalBytes / 1_073_741_824).toFixed(3),
        maxGB: MAX_SIZE_GB,
        maxAgeHours: MAX_AGE_HOURS,
        oldestFile: files[0]?.name ?? null,
        newestFile: files[files.length - 1]?.name ?? null,
    };
}

export function getDiskStatus() {
    try {
        const stats = fs.statfsSync(RECORDINGS_DIR.startsWith('/') && fs.existsSync(RECORDINGS_DIR)
            ? RECORDINGS_DIR
            : process.cwd());
        const GB = 1_073_741_824;
        const availableBytes = stats.bavail * stats.bsize;
        const totalBytes     = stats.blocks * stats.bsize;
        const usedBytes      = (stats.blocks - stats.bfree) * stats.bsize;

        const recFiles   = getRecordingFiles();
        const recBytes   = recFiles.reduce((s, f) => s + f.size, 0);

        return {
            availableGB:   +(availableBytes / GB).toFixed(1),
            totalGB:       +(totalBytes / GB).toFixed(1),
            usedGB:        +(usedBytes / GB).toFixed(1),
            recordingsGB:  +(recBytes / GB).toFixed(2),
            maxGB:         MAX_SIZE_GB,
            maxAgeHours:   MAX_AGE_HOURS,
        };
    } catch (_) {
        return null;
    }
}

// Run on module load and then every hour.
cleanOldRecordings().catch(err => console.error('[retention] startup cleanup failed:', err.message));
setInterval(() => cleanOldRecordings().catch(err => console.error('[retention] cleanup failed:', err.message)), 3_600_000);
