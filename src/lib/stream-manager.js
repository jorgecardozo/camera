import { spawn } from 'child_process';

// JPEG SOI (FF D8) and EOI (FF D9) markers.
// In entropy-coded JPEG data, FF is always followed by 00 (byte stuffing),
// so FF D9 only appears as the real EOI — safe to use for frame detection.
function findMarker(buf, b0, b1, from = 0) {
    for (let i = from; i < buf.length - 1; i++) {
        if (buf[i] === b0 && buf[i + 1] === b1) return i;
    }
    return -1;
}

class StreamManager {
    constructor() {
        this.streams = new Map();
    }

    _spawn(state) {
        const ffmpeg = spawn('ffmpeg', [
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-probesize', '32',
            '-analyzeduration', '0',
            '-rtsp_transport', 'tcp',
            '-i', state.camera.rtspUrl,
            '-f', 'image2pipe',   // raw JPEG frames, no multipart wrapper
            '-vcodec', 'mjpeg',
            '-q:v', '3',
            '-r', '25',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            'pipe:1',
        ]);

        state.process = ffmpeg;
        let buf = Buffer.alloc(0);

        ffmpeg.stdout.on('data', (chunk) => {
            buf = Buffer.concat([buf, chunk]);

            let search = 0;
            while (true) {
                const start = findMarker(buf, 0xFF, 0xD8, search);
                if (start === -1) break;

                const end = findMarker(buf, 0xFF, 0xD9, start + 2);
                if (end === -1) break; // incomplete frame — wait for more data

                const frame = buf.slice(start, end + 2); // complete JPEG frame
                search = end + 2;

                // Build multipart chunk for HTTP clients
                const header = Buffer.from(
                    `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
                );

                for (const res of state.clients) {
                    try {
                        res.write(header);
                        res.write(frame);
                        res.write(Buffer.from('\r\n'));
                    } catch (_) {
                        state.clients.delete(res);
                    }
                }

                // Feed complete JPEG frame to recorder — always starts at a clean boundary
                if (state.recorder && !state.recorder.stdin.destroyed) {
                    try { state.recorder.stdin.write(frame); } catch (_) {}
                }
            }

            // Keep only unprocessed data
            buf = search > 0 ? buf.slice(search) : buf;

            // Safety valve: drop buffer if it grows beyond 4 MB (stalled stream)
            if (buf.length > 4 * 1024 * 1024) buf = Buffer.alloc(0);
        });

        ffmpeg.stderr.on('data', () => {});

        ffmpeg.on('close', () => {
            state.process = null;
            buf = Buffer.alloc(0);
            if (state.clients.size > 0 || state.recorder) {
                setTimeout(() => this._spawn(state), 2000);
            } else {
                this.streams.delete(state.cameraId);
            }
        });
    }

    _getOrCreate(cameraId, camera) {
        if (this.streams.has(cameraId)) return this.streams.get(cameraId);
        const state = { cameraId, camera, process: null, clients: new Set(), recorder: null };
        this.streams.set(cameraId, state);
        this._spawn(state);
        return state;
    }

    addClient(cameraId, camera, res) {
        const state = this._getOrCreate(cameraId, camera);
        state.clients.add(res);
        res.on('close', () => {
            state.clients.delete(res);
            if (state.clients.size === 0 && !state.recorder) {
                setTimeout(() => {
                    if (state.clients.size === 0 && !state.recorder) {
                        state.process?.kill('SIGTERM');
                        this.streams.delete(cameraId);
                    }
                }, 15000);
            }
        });
    }

}

export const streamManager = new StreamManager();
