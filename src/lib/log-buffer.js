// Circular buffer that captures server-side console output for the in-app log viewer.
// Import this module once early (e.g. from stream-manager.js) to activate interception.

const MAX_LINES = 600;

/** @type {{ t: string, level: 'info'|'warn'|'error', msg: string }[]} */
const buffer = [];

function push(level, args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    buffer.push({ t: new Date().toISOString(), level, msg });
    if (buffer.length > MAX_LINES) buffer.shift();
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
