import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cameraManager } from './camera-utils';
import ffmpegStatic from 'ffmpeg-static';
import './log-buffer'; // activate console interception early

const SEGMENT_MS = parseInt(process.env.RECORDING_SEGMENT_MINUTES || '30', 10) * 60_000;
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';


class StreamManager {
    constructor() {
        this.streams   = new Map(); // viewer streams  (one per camera)
        this.recorders = new Map(); // direct RTSP recorders (one per camera)
        setImmediate(() => this._initContinuous());
    }

    // ─── Auto-start on boot ─────────────────────────────────────────────────

    async _initContinuous() {
        for (const camera of cameraManager.getAllCameras()) {
            if (camera.continuousRecord || camera.isRecording) {
                this.startRecorder(camera.id, camera);
            }
        }
        const hasMotion = cameraManager.getAllCameras().some(c => c.motionDetect);
        if (hasMotion) {
            const { motionDetector } = await import('./motion-detector.js');
            for (const camera of cameraManager.getAllCameras()) {
                if (camera.motionDetect) motionDetector.start(camera.id, camera);
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _hasViewers(state) {
        return state.clients.size > 0 || state.sseClients.size > 0 || state.wsClients.size > 0;
    }

    _scheduleKill(state) {
        setTimeout(() => {
            if (!this._hasViewers(state)) {
                console.log(`[stream:${state.cameraId}] Sin clientes por 15s → matando FFmpeg`);
                if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }
                state.ffmpegProcess?.kill('SIGTERM');
                this.streams.delete(state.cameraId);
            }
        }, 15000);
    }

    // ─── Viewer (MJPEG + SSE + WebSocket) ───────────────────────────────────

    _spawn(state) {
        console.log(`[stream:${state.cameraId}] Arrancando FFmpeg viewer → ${state.camera.rtspUrl.replace(/:\/\/[^@]+@/, '://**@')}`);
        const ffmpeg = spawn(FFMPEG, [
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-probesize', '32',
            '-analyzeduration', '0',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', state.camera.rtspUrl,
            '-f', 'mpjpeg',
            '-vcodec', 'mjpeg',
            '-q:v', '5',
            '-r', '15',
            '-vf', "scale=w='min(640,iw)':h=-2",
            'pipe:1',
        ]);

        state.ffmpegProcess = ffmpeg;
        let buf = Buffer.alloc(0);

        ffmpeg.stdout.on('data', (chunk) => {
            buf = Buffer.concat([buf, chunk]);

            // mpjpeg includes Content-Length headers — extract exact bytes per frame.
            while (true) {
                const hEnd = buf.indexOf('\r\n\r\n');
                if (hEnd === -1) break;

                const headerStr = buf.slice(0, hEnd).toString('latin1');
                const clMatch = headerStr.match(/Content-Length:\s*(\d+)/i);

                if (!clMatch) {
                    buf = buf.slice(hEnd + 4);
                    continue;
                }

                const frameSize = parseInt(clMatch[1], 10);
                const dataStart = hEnd + 4;
                if (buf.length < dataStart + frameSize) break;

                const frame = buf.slice(dataStart, dataStart + frameSize);
                buf = buf.slice(dataStart + frameSize);

                state.lastFrame = frame;

                if (!state.markedOnline) {
                    state.markedOnline = true;
                    state.failCount = 0;
                    const cam = cameraManager.getCamera(state.cameraId);
                    if (cam) cam.isOnline = true;
                }

                // MJPEG multipart clients
                if (state.clients.size > 0) {
                    const mjpegHeader = Buffer.from(
                        `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
                    );
                    for (const res of state.clients) {
                        try {
                            res.write(mjpegHeader);
                            res.write(frame);
                            res.write(Buffer.from('\r\n'));
                        } catch (_) {
                            state.clients.delete(res);
                        }
                    }
                }

                // SSE clients — base64-encoded JPEG
                if (state.sseClients.size > 0) {
                    const b64 = frame.toString('base64');
                    for (const res of state.sseClients) {
                        try {
                            res.write(`data: ${b64}\n\n`);
                        } catch (_) {
                            state.sseClients.delete(res);
                        }
                    }
                }

                // WebSocket clients — raw binary JPEG (no base64 overhead)
                if (state.wsClients.size > 0) {
                    for (const ws of state.wsClients) {
                        if (ws.readyState === 1 /* OPEN */) {
                            try { ws.send(frame); } catch (_) { state.wsClients.delete(ws); }
                        } else if (ws.readyState > 1 /* CLOSING/CLOSED */) {
                            state.wsClients.delete(ws);
                        }
                    }
                }
            }

            if (buf.length > 8 * 1024 * 1024) buf = Buffer.alloc(0);
        });

        let stderrBuf = '';
        ffmpeg.stderr.on('data', (chunk) => {
            stderrBuf += chunk.toString();
            const lines = stderrBuf.split('\n');
            stderrBuf = lines.pop();
            for (const line of lines) {
                if (line.trim()) console.log(`[ffmpeg:${state.cameraId}] ${line}`);
            }
        });

        ffmpeg.on('close', (code, signal) => {
            if (state.ffmpegProcess !== ffmpeg) return;
            state.ffmpegProcess = null;
            buf = Buffer.alloc(0);

            const isSignalKill = signal != null;
            console.log(`[stream:${state.cameraId}] FFmpeg cerrado — code=${code} signal=${signal} clients=${state.clients.size} sse=${state.sseClients.size} ws=${state.wsClients.size} failCount=${state.failCount || 0}`);

            if (!isSignalKill && code !== 0) {
                state.failCount = (state.failCount || 0) + 1;
                if (state.failCount >= 3) {
                    const cam = cameraManager.getCamera(state.cameraId);
                    if (cam) cam.isOnline = false;
                    console.log(`[stream:${state.cameraId}] Cámara marcada offline (${state.failCount} fallos consecutivos)`);
                }
            }

            if (this._hasViewers(state)) {
                const backoff = isSignalKill
                    ? 2000
                    : Math.min(60000, 5000 * Math.pow(2, Math.max(0, (state.failCount || 1) - 1)));
                console.log(`[stream:${state.cameraId}] Reintentando en ${backoff}ms`);
                state.retryTimer = setTimeout(() => {
                    state.retryTimer = null;
                    state.markedOnline = false;
                    if (this._hasViewers(state)) this._spawn(state);
                }, backoff);
            } else {
                console.log(`[stream:${state.cameraId}] Sin clientes, stream eliminado`);
                this.streams.delete(state.cameraId);
            }
        });
    }

    _getOrCreate(cameraId, camera) {
        if (this.streams.has(cameraId)) return this.streams.get(cameraId);
        const state = {
            cameraId,
            camera,
            ffmpegProcess: null,
            clients:    new Set(), // MJPEG long-poll responses
            sseClients: new Set(), // SSE responses
            wsClients:  new Set(), // WebSocket connections
            failCount: 0,
            retryTimer: null,
            markedOnline: false,
            frameAnchor: null,
            frameAnchorTimer: null,
        };
        this.streams.set(cameraId, state);
        this._spawn(state);
        return state;
    }

    addClient(cameraId, camera, res) {
        const state = this._getOrCreate(cameraId, camera);
        state.clients.add(res);
        console.log(`[stream:${cameraId}] MJPEG cliente conectado (total: ${state.clients.size})`);
        res.on('close', () => {
            state.clients.delete(res);
            console.log(`[stream:${cameraId}] MJPEG cliente desconectado (quedan: ${state.clients.size})`);
            if (!this._hasViewers(state)) this._scheduleKill(state);
        });
    }

    addSseClient(cameraId, camera, res) {
        const state = this._getOrCreate(cameraId, camera);
        state.sseClients.add(res);
        console.log(`[stream:${cameraId}] SSE cliente conectado (total: ${state.sseClients.size})`);
        res.on('close', () => {
            state.sseClients.delete(res);
            console.log(`[stream:${cameraId}] SSE cliente desconectado (quedan: ${state.sseClients.size})`);
            if (!this._hasViewers(state)) this._scheduleKill(state);
        });
    }

    addWsClient(cameraId, camera, ws) {
        const state = this._getOrCreate(cameraId, camera);
        state.wsClients.add(ws);
        console.log(`[stream:${cameraId}] WS cliente conectado (total: ${state.wsClients.size})`);
        ws.on('close', () => {
            state.wsClients.delete(ws);
            console.log(`[stream:${cameraId}] WS cliente desconectado (quedan: ${state.wsClients.size})`);
            if (!this._hasViewers(state)) this._scheduleKill(state);
        });
    }

    // ─── Recorder (direct RTSP, c:v copy) ───────────────────────────────────

    startRecorder(cameraId, camera, isMotion = false) {
        const existing = this.recorders.get(cameraId);
        if (existing) {
            if (isMotion && !existing.isMotion) return { status: 'manual_active' };
            return { status: 'already_recording', filename: existing.filename };
        }

        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
        fs.mkdirSync(recordingsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename  = `cam_${cameraId}_${timestamp}.mp4`;
        const outputPath = path.join(recordingsDir, filename);

        const rec = spawn(FFMPEG, [
            '-fflags', 'nobuffer',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', camera.rtspUrl,
            '-map', '0:v',
            '-c:v', 'copy',
            '-map', '0:a?',
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
            if (cam) cam.isRecording = false;

            if (camera.continuousRecord) {
                setTimeout(() => this.startRecorder(cameraId, camera), 500);
            }
        });

        if (camera.continuousRecord && SEGMENT_MS > 0) {
            segmentTimer = setTimeout(() => rec.kill('SIGTERM'), SEGMENT_MS);
        }

        this.recorders.set(cameraId, { process: rec, filename, segmentTimer, isMotion });

        const cam = cameraManager.getCamera(cameraId);
        if (cam) cam.isRecording = true;

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

        if (cam) cam.isRecording = false;
        return { status: 'stopped' };
    }

    stopMotionRecorder(cameraId) {
        const entry = this.recorders.get(cameraId);
        if (!entry?.isMotion) return;
        if (entry.segmentTimer) clearTimeout(entry.segmentTimer);
        entry.process.kill('SIGTERM');
        this.recorders.delete(cameraId);
        const cam = cameraManager.getCamera(cameraId);
        if (cam) cam.isRecording = false;
    }

    // ─── Frame snapshot (fallback for /api/cameras/[id]/frame) ──────────────

    ensureViewer(cameraId, camera) {
        const state = this._getOrCreate(cameraId, camera);

        clearTimeout(state.frameAnchorTimer);

        if (!state.frameAnchor) {
            const anchor = { write: () => {}, on: () => {} };
            state.frameAnchor = anchor;
            state.clients.add(anchor);
        }

        state.frameAnchorTimer = setTimeout(() => {
            state.clients.delete(state.frameAnchor);
            state.frameAnchor = null;
            state.frameAnchorTimer = null;
            if (!this._hasViewers(state)) this._scheduleKill(state);
        }, 5000);
    }

    // ─── Motion hold (keeps viewer alive while YOLO reads the MJPEG stream) ───

    getLastFrame(cameraId) {
        return this.streams.get(cameraId)?.lastFrame ?? null;
    }

    acquireMotionHold(cameraId, camera) {
        const state = this._getOrCreate(cameraId, camera);
        if (state.motionAnchor) return;
        const anchor = { write: () => {}, on: () => {} };
        state.motionAnchor = anchor;
        state.clients.add(anchor);
    }

    releaseMotionHold(cameraId) {
        const state = this.streams.get(cameraId);
        if (!state?.motionAnchor) return;
        state.clients.delete(state.motionAnchor);
        state.motionAnchor = null;
        if (!this._hasViewers(state)) this._scheduleKill(state);
    }

    // Force-stop viewer + recorder (used on delete).
    forceStopAll(cameraId) {
        const viewer = this.streams.get(cameraId);
        if (viewer) {
            viewer.clients.clear();
            for (const res of viewer.sseClients) { try { res.end(); } catch (_) {} }
            viewer.sseClients.clear();
            for (const ws of viewer.wsClients) { try { ws.close(1001, 'Camera deleted'); } catch (_) {} }
            viewer.wsClients.clear();
            if (viewer.retryTimer) { clearTimeout(viewer.retryTimer); viewer.retryTimer = null; }
            viewer.ffmpegProcess?.kill('SIGTERM');
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
