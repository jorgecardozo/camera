import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cameraManager } from './camera-utils';

const SEGMENT_MS = parseInt(process.env.RECORDING_SEGMENT_MINUTES || '30', 10) * 60_000;

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
        this.streams   = new Map(); // MJPEG viewer streams  (one per camera)
        this.recorders = new Map(); // Direct RTSP recorders (one per camera)
        setImmediate(() => this._initContinuous());
    }

    // ─── Auto-start on boot ─────────────────────────────────────────────────

    _initContinuous() {
        for (const camera of cameraManager.getAllCameras()) {
            if (camera.continuousRecord || camera.isRecording) {
                this.startRecorder(camera.id, camera);
            }
        }
    }

    // ─── Viewer (MJPEG) ─────────────────────────────────────────────────────

    _spawn(state) {
        const ffmpeg = spawn('ffmpeg', [
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-probesize', '32',
            '-analyzeduration', '0',
            '-rtsp_transport', 'tcp',
            '-i', state.camera.rtspUrl,
            '-f', 'image2pipe',
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
                if (end === -1) break;

                const frame = buf.slice(start, end + 2);
                search = end + 2;

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
            }
            buf = search > 0 ? buf.slice(search) : buf;
            if (buf.length > 4 * 1024 * 1024) buf = Buffer.alloc(0);
        });

        ffmpeg.stderr.on('data', () => {});

        ffmpeg.on('close', () => {
            state.process = null;
            buf = Buffer.alloc(0);
            if (state.clients.size > 0) {
                setTimeout(() => this._spawn(state), 2000);
            } else {
                this.streams.delete(state.cameraId);
            }
        });
    }

    _getOrCreate(cameraId, camera) {
        if (this.streams.has(cameraId)) return this.streams.get(cameraId);
        const state = { cameraId, camera, process: null, clients: new Set() };
        this.streams.set(cameraId, state);
        this._spawn(state);
        return state;
    }

    addClient(cameraId, camera, res) {
        const state = this._getOrCreate(cameraId, camera);
        state.clients.add(res);
        res.on('close', () => {
            state.clients.delete(res);
            if (state.clients.size === 0) {
                setTimeout(() => {
                    if (state.clients.size === 0) {
                        state.process?.kill('SIGTERM');
                        this.streams.delete(cameraId);
                    }
                }, 15000);
            }
        });
    }

    // ─── Recorder (direct RTSP, c:v copy) ───────────────────────────────────

    startRecorder(cameraId, camera) {
        if (this.recorders.has(cameraId)) {
            return { status: 'already_recording', filename: this.recorders.get(cameraId).filename };
        }

        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
        fs.mkdirSync(recordingsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename  = `cam_${cameraId}_${timestamp}.mp4`;
        const outputPath = path.join(recordingsDir, filename);

        // Direct RTSP copy — zero CPU, original quality, includes audio.
        const rec = spawn('ffmpeg', [
            '-fflags', 'nobuffer',
            '-rtsp_transport', 'tcp',
            '-i', camera.rtspUrl,
            '-map', '0:v',
            '-c:v', 'copy',
            '-map', '0:a?',     // include audio if the camera has it
            '-c:a', 'aac',
            '-ar', '44100',
            '-ac', '1',
            '-b:a', '64k',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            '-y',
            outputPath,
        ]);

        rec.stderr.on('data', () => {});

        let segmentTimer = null;

        rec.on('close', () => {
            if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = null; }
            if (this.recorders.get(cameraId)?.process === rec) {
                this.recorders.delete(cameraId);
            }
            const cam = cameraManager.getCamera(cameraId);
            if (cam) { cam.isRecording = false; cameraManager._save(); }

            // Restart segment for continuous mode.
            if (camera.continuousRecord) {
                setTimeout(() => this.startRecorder(cameraId, camera), 500);
            }
        });

        // Periodic segmentation for continuous recordings.
        if (camera.continuousRecord && SEGMENT_MS > 0) {
            segmentTimer = setTimeout(() => {
                rec.kill('SIGTERM');
            }, SEGMENT_MS);
        }

        this.recorders.set(cameraId, { process: rec, filename, segmentTimer });

        const cam = cameraManager.getCamera(cameraId);
        if (cam) { cam.isRecording = true; cameraManager._save(); }

        return { status: 'started', filename };
    }

    stopRecorder(cameraId) {
        const entry = this.recorders.get(cameraId);
        if (!entry) return { status: 'not_recording' };

        const cam = cameraManager.getCamera(cameraId);
        if (cam?.continuousRecord) {
            return { status: 'continuous', error: 'Desactivá grabación continua primero desde Configuración' };
        }

        if (entry.segmentTimer) clearTimeout(entry.segmentTimer);
        entry.process.kill('SIGTERM');
        this.recorders.delete(cameraId);

        if (cam) { cam.isRecording = false; cameraManager._save(); }
        return { status: 'stopped' };
    }

    // Force-stop viewer + recorder regardless of continuousRecord (used on delete).
    forceStopAll(cameraId) {
        const viewer = this.streams.get(cameraId);
        if (viewer) {
            viewer.clients.clear();
            viewer.process?.kill('SIGTERM');
            this.streams.delete(cameraId);
        }

        const rec = this.recorders.get(cameraId);
        if (rec) {
            if (rec.segmentTimer) clearTimeout(rec.segmentTimer);
            rec.process.kill('SIGTERM');
            this.recorders.delete(cameraId);
        }
    }
}

export const streamManager = new StreamManager();
