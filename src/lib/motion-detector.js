import { spawn } from 'child_process';
import path from 'path';
import { cameraManager } from './camera-utils';
import { notificationManager } from './notification-manager.js';
import { insertEvent } from './event-store.js';

const MOTION_CLEAR_MS     = 5_000;  // clear visual state after 5s of no detection
const SCREENSHOT_COOLDOWN = 10_000; // max one auto-screenshot per 10s per camera
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'motion_detector.py');
const PYTHON      = path.join(process.cwd(), '.venv', 'bin', 'python3');

// motionSensitivity maps to YOLO confidence threshold (0.0–1.0).
// Legacy values < 0.1 (old MOG2 scene threshold) are remapped to 0.12.
// 0.12 is intentionally low to detect people through iron gates and fences.
function resolveConfidence(sensitivity) {
    const val = sensitivity ?? 0.12;
    return (val < 0.1 || val > 1) ? 0.12 : val;
}

// YOLO reads from the in-process MJPEG viewer instead of RTSP directly.
// This frees the camera's limited RTSP slots for the recorder, so detection
// keeps running even while a recording is active.
function buildMjpegUrl(cameraId) {
    const port = process.env.PORT || 3000;
    const pass  = process.env.APP_PASSWORD || '';
    const auth  = pass ? `:${encodeURIComponent(pass)}@` : '';
    return `http://${auth}localhost:${port}/api/cameras/${cameraId}/mjpeg`;
}

class MotionDetector {
    constructor() {
        this.detectors = new Map();
    }

    start(cameraId, camera) {
        if (this.detectors.has(cameraId)) return;
        // Reserve the slot immediately to prevent double-start from rapid calls.
        this.detectors.set(cameraId, { process: null, stopTimer: null });

        import('./stream-manager.js').then(({ streamManager }) => {
            if (!this.detectors.has(cameraId)) return; // was stopped before import resolved

            // Keep the viewer FFmpeg running so YOLO has an MJPEG source to read from.
            streamManager.acquireMotionHold(cameraId, camera);

            const url  = buildMjpegUrl(cameraId);
            const conf = resolveConfidence(camera.motionSensitivity);
            const proc = spawn(PYTHON, [SCRIPT_PATH, url, String(conf)]);

            const state = { process: proc, clearTimer: null, lastScreenshotAt: 0 };
            this.detectors.set(cameraId, state);

            let buf = '';
            proc.stdout.on('data', (chunk) => {
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const { motion, boxes, frame_b64 } = JSON.parse(line);
                        if (motion) {
                            const annotatedFrame = frame_b64 ? Buffer.from(frame_b64, 'base64') : null;
                            this._onMotion(cameraId, camera, boxes || [], annotatedFrame);
                        }
                    } catch (_) {}
                }
            });

            proc.stderr.on('data', () => {});

            proc.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    console.error('[motion] Python no encontrado en .venv — corré: python3 -m venv .venv && .venv/bin/pip install opencv-python ultralytics');
                }
                this.detectors.delete(cameraId);
                streamManager.releaseMotionHold(cameraId);
            });

            proc.on('close', () => {
                if (this.detectors.get(cameraId)?.process !== proc) return;
                this.detectors.delete(cameraId);
                streamManager.releaseMotionHold(cameraId);
                const cam = cameraManager.getCamera(cameraId);
                if (cam?.motionDetect) setTimeout(() => this.start(cameraId, cam), 3000);
            });
        });
    }

    stop(cameraId) {
        const state = this.detectors.get(cameraId);
        if (!state) return;
        if (state.clearTimer) { clearTimeout(state.clearTimer); state.clearTimer = null; }
        state.process?.kill('SIGTERM');
        this.detectors.delete(cameraId);
        import('./stream-manager.js').then(({ streamManager }) => {
            streamManager.releaseMotionHold(cameraId);
        });
        const cam = cameraManager.getCamera(cameraId);
        if (cam) cam.motionBoxes = [];
    }

    isRunning(cameraId) {
        return this.detectors.has(cameraId);
    }

    _onMotion(cameraId, camera, boxes, annotatedFrame) {
        const state = this.detectors.get(cameraId);
        if (!state) return;

        const cam = cameraManager.getCamera(cameraId);
        if (cam) {
            cam.motionActive = true;
            cam.motionBoxes  = boxes;
        }

        // Reset the visual-state clear timer on every detection.
        if (state.clearTimer) clearTimeout(state.clearTimer);
        state.clearTimer = setTimeout(() => {
            const c = cameraManager.getCamera(cameraId);
            if (c) { c.motionActive = false; c.motionBoxes = []; }
            state.clearTimer = null;
        }, MOTION_CLEAR_MS);

        // Auto-screenshot: at most one every SCREENSHOT_COOLDOWN ms.
        const now = Date.now();
        if (now - state.lastScreenshotAt >= SCREENSHOT_COOLDOWN) {
            state.lastScreenshotAt = now;
            // Use annotated frame (with boxes drawn) for both screenshot and Telegram.
            // Fall back to raw MJPEG frame if Python didn't provide one.
            import('./stream-manager.js').then(({ streamManager }) => {
                const frame = annotatedFrame || streamManager.getLastFrame(cameraId);
                if (frame) cameraManager.saveFrame(cameraId, frame);
                const cam = cameraManager.getCamera(cameraId);
                if (cam) {
                    notificationManager.notify(cameraId, cam, boxes, frame).catch(() => {});
                    const primaryBox = boxes[0];
                    if (primaryBox) {
                        try {
                            insertEvent({
                                cameraId,
                                cameraName: cam.name,
                                label: primaryBox.label,
                                confidence: primaryBox.conf,
                                screenshotPath: cam.lastScreenshot ? `/api/screenshots/${cam.lastScreenshot}` : null,
                            });
                        } catch (err) {
                            console.error('[motion] failed to insert event:', err.message);
                        }
                    }
                }
            });
        }
    }
}

export const motionDetector = new MotionDetector();
