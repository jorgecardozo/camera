import fs from 'fs';
import path from 'path';

const MAX_LINES = 600;
const LOG_FILE  = path.join(process.cwd(), 'logs', 'server.log');

// Ensure logs/ directory exists
try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch (_) {}

/** @type {{ t: string, level: 'info'|'warn'|'error', msg: string }[]} */
const buffer = [];

let writeStream = null;
function getStream() {
    if (!writeStream || writeStream.destroyed) {
        writeStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    }
    return writeStream;
}

function push(level, args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const t   = new Date().toISOString();
    buffer.push({ t, level, msg });
    if (buffer.length > MAX_LINES) buffer.shift();

    // Write to file: "2026-04-26T12:00:00.000Z [info ] mensaje"
    const label = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN ' : 'INFO ';
    try { getStream().write(`${t} [${label}] ${msg}\n`); } catch (_) {}
}

// Intercept console — runs once when module is first imported
const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log   = (...a) => { _log(...a);   push('info',  a); };
console.warn  = (...a) => { _warn(...a);  push('warn',  a); };
console.error = (...a) => { _error(...a); push('error', a); };

/**
 * @param {number} last  Number of most-recent lines to return
 * @param {number} since Return only lines with index > since (-1 = all)
 */
export function getLogs(last = 300, since = -1) {
    const slice = buffer.slice(-last);
    if (since < 0) return { lines: slice, total: buffer.length };
    const startIdx = buffer.length - slice.length;
    return {
        lines: slice.filter((_, i) => startIdx + i > since),
        total: buffer.length,
    };
}
