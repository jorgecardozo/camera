import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cameraManager } from './camera-utils';
import ffmpegStatic from 'ffmpeg-static';

const SEGMENT_MS = parseInt(process.env.RECORDING_SEGMENT_MINUTES || '30', 10) * 60_000;
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';


class StreamManager {
    constructor() {
        this.streams   = new Map(); // MJPEG viewer streams  (one per camera)
        this.recorders = new Map(); // Direct RTSP recorders (one per camera)
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

    // ─── Viewer (MJPEG) ─────────────────────────────────────────────────────

    _spawn(state) {
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
            '-q:v', '3',
            '-r', '25',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            'pipe:1',
        ]);

        state.ffmpegProcess = ffmpeg;
        let buf = Buffer.alloc(0);

        ffmpeg.stdout.on('data', (chunk) => {
            buf = Buffer.concat([buf, chunk]);

            // mpjpeg format includes Content-Length headers so we extract
            // exactly the right number of bytes per frame — no SOI/EOI scanning
            // that can mis-assemble frames from partial network data.
            while (true) {
                const hEnd = buf.indexOf('\r\n\r\n');
                if (hEnd === -1) break;

                const headerStr = buf.slice(0, hEnd).toString('latin1');
                const clMatch = headerStr.match(/Content-Length:\s*(\d+)/i);

                if (!clMatch) {
                    // Initial multipart Content-Type line — skip it.
                    buf = buf.slice(hEnd + 4);
                    continue;
                }

                const frameSize = parseInt(clMatch[1], 10);
                const dataStart = hEnd + 4;
                if (buf.length < dataStart + frameSize) break; // wait for more data

                const frame = buf.slice(dataStart, dataStart + frameSize);
                buf = buf.slice(dataStart + frameSize);

                state.lastFrame = frame; // kept for motion-triggered screenshots

                // First frame received — mark camera online and reset failure count.
                if (!state.markedOnline) {
                    state.markedOnline = true;
                    state.failCount = 0;
                    const cam = cameraManager.getCamera(state.cameraId);
                    if (cam) cam.isOnline = true;
                }

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

            if (buf.length > 8 * 1024 * 1024) buf = Buffer.alloc(0);
        });

        ffmpeg.stderr.on('data', () => {});

        ffmpeg.on('close', (code, signal) => {
            if (state.ffmpegProcess !== ffmpeg) return; // stale process
            state.ffmpegProcess = null;
            buf = Buffer.alloc(0);

            const isSignalKill = signal != null; // killed intentionally

            if (!isSignalKill && code !== 0) {
                state.failCount = (state.failCount || 0) + 1;
                if (state.failCount >= 3) {
                    const cam = cameraManager.getCamera(state.cameraId);
                    if (cam) cam.isOnline = false;
                }
            }

            if (state.clients.size > 0) {
                const backoff = isSignalKill
                    ? 2000
                    : Math.min(60000, 5000 * Math.pow(2, Math.max(0, (state.failCount || 1) - 1)));
                state.retryTimer = setTimeout(() => {
                    state.retryTimer = null;
                    state.markedOnline = false; // reset so next connection re-marks online
                    if (state.clients.size > 0) this._spawn(state);
                }, backoff);
            } else {
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
            clients: new Set(),
            failCount: 0,
            retryTimer: null,
            markedOnline: false,
        };
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
                        if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }
                        state.ffmpegProcess?.kill('SIGTERM');
                        this.streams.delete(cameraId);
                    }
                }, 15000);
            }
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

        // Direct RTSP copy — zero CPU, original quality, includes audio.
        const rec = spawn(FFMPEG, [
            '-fflags', 'nobuffer',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
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
            if (cam) cam.isRecording = false;

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
        if (state.clients.size === 0) {
            setTimeout(() => {
                if (state.clients.size === 0) {
                    if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = null; }
                    state.ffmpegProcess?.kill('SIGTERM');
                    this.streams.delete(cameraId);
                }
            }, 15000);
        }
    }

    // Force-stop viewer + recorder regardless of continuousRecord (used on delete).
    forceStopAll(cameraId) {
        const viewer = this.streams.get(cameraId);
        if (viewer) {
            viewer.clients.clear();
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
