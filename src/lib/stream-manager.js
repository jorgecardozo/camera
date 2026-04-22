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
        this.streams = new Map();
        // Defer until after module graph is settled so cameraManager is ready.
        setImmediate(() => this._initContinuous());
    }

    _initContinuous() {
        for (const camera of cameraManager.getAllCameras()) {
            if (camera.continuousRecord || camera.isRecording) {
                this._getOrCreate(camera.id, camera);
                this.startRecorder(camera.id, camera);
            }
        }
    }

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

                // Pipe frame to recorder — starts at a clean JPEG boundary
                if (state.recorder && !state.recorder.stdin.destroyed) {
                    try { state.recorder.stdin.write(frame); } catch (_) {}
                }
            }

            buf = search > 0 ? buf.slice(search) : buf;
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
        const state = {
            cameraId,
            camera,
            process: null,
            clients: new Set(),
            recorder: null,
            currentFilename: null,
            segmentTimer: null,
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

    startRecorder(cameraId, camera) {
        const state = this._getOrCreate(cameraId, camera);

        if (state.recorder && !state.recorder.stdin.destroyed) {
            return { status: 'already_recording', filename: state.currentFilename };
        }

        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
        fs.mkdirSync(recordingsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cam_${cameraId}_${timestamp}.mp4`;
        const outputPath = path.join(recordingsDir, filename);

        // Re-encode MJPEG frames → H.264 MP4 for broad browser compatibility.
        const recorder = spawn('ffmpeg', [
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-framerate', '25',
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-pix_fmt', 'yuv420p',
            '-vsync', 'vfr',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            '-y',
            outputPath,
        ]);

        recorder.stderr.on('data', () => {});

        recorder.on('close', () => {
            if (state.recorder === recorder) state.recorder = null;
            if (state.segmentTimer) {
                clearTimeout(state.segmentTimer);
                state.segmentTimer = null;
            }
            const cam = cameraManager.getCamera(cameraId);
            if (cam) {
                cam.isRecording = false;
                cameraManager._save();
            }
            if (state.camera.continuousRecord) {
                setTimeout(() => this.startRecorder(cameraId, state.camera), 500);
            }
        });

        state.recorder = recorder;
        state.currentFilename = filename;

        // Periodic segmentation for continuous recordings.
        if (state.camera.continuousRecord && SEGMENT_MS > 0) {
            state.segmentTimer = setTimeout(() => {
                if (state.recorder === recorder && !recorder.stdin.destroyed) {
                    recorder.stdin.end();
                }
            }, SEGMENT_MS);
        }

        const cam = cameraManager.getCamera(cameraId);
        if (cam) {
            cam.isRecording = true;
            cameraManager._save();
        }

        return { status: 'started', filename };
    }

    stopRecorder(cameraId) {
        const state = this.streams.get(cameraId);
        if (!state?.recorder || state.recorder.stdin.destroyed) {
            return { status: 'not_recording' };
        }

        if (state.camera.continuousRecord) {
            return { status: 'continuous', error: 'Desactivá grabación continua primero desde Configuración' };
        }

        if (state.segmentTimer) {
            clearTimeout(state.segmentTimer);
            state.segmentTimer = null;
        }

        try { state.recorder.stdin.end(); } catch (_) {}
        state.recorder = null;

        const cam = cameraManager.getCamera(cameraId);
        if (cam) {
            cam.isRecording = false;
            cameraManager._save();
        }

        return { status: 'stopped' };
    }
}

export const streamManager = new StreamManager();
