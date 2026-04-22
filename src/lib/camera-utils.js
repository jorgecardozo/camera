import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CAMERAS_FILE = path.join(process.cwd(), 'cameras.json');

export class CameraManager {
    constructor() {
        this.activeRecordings = new Map();
        this.cameras = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(CAMERAS_FILE)) {
                const data = JSON.parse(fs.readFileSync(CAMERAS_FILE, 'utf-8'));
                const map = new Map();
                for (const cam of data) map.set(cam.id, { ...cam, isRecording: false });
                return map;
            }
        } catch (_) {}
        return new Map();
    }

    _save() {
        const data = Array.from(this.cameras.values()).map(({ isRecording, ...rest }) => rest);
        fs.writeFileSync(CAMERAS_FILE, JSON.stringify(data, null, 2));
    }

    // Registrar una cámara
    registerCamera(id, config) {
        this.cameras.set(id, {
            id,
            name: config.name,
            ip: config.ip,
            port: config.port || 554,
            username: config.username,
            password: config.password,
            httpPort: config.httpPort || 80,
            rtspUrl: `rtsp://${config.username}:${config.password}@${config.ip}:${config.port || 554}${config.rtspPath || '/live'}`,
            httpUrl: `http://${config.ip}:${config.httpPort || 80}`,
            isRecording: false,
            lastScreenshot: null
        });
        this._save();
    }

    // Obtener todas las cámaras
    getAllCameras() {
        return Array.from(this.cameras.values());
    }

    // Obtener una cámara específica
    getCamera(id) {
        return this.cameras.get(id);
    }

    // Iniciar grabación
    startRecording(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (!camera) throw new Error('Cámara no encontrada');

        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
        if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cam_${cameraId}_${timestamp}.mp4`;
        const outputPath = path.join(recordingsDir, filename);

        // -c:v copy: zero re-encoding CPU (passes H.264 bitstream through directly)
        // -c:a aac:  audio transcoding is trivial CPU — this is what adds audio
        const ffmpeg = spawn('ffmpeg', [
            '-fflags', 'nobuffer',
            '-rtsp_transport', 'tcp',
            '-i', camera.rtspUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ar', '44100',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            '-y',
            outputPath,
        ]);

        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('error', () => {
            this.activeRecordings.delete(cameraId);
            camera.isRecording = false;
        });
        ffmpeg.on('close', () => {
            this.activeRecordings.delete(cameraId);
            camera.isRecording = false;
        });

        this.activeRecordings.set(cameraId, { process: ffmpeg, filename });
        camera.isRecording = true;

        return { status: 'started', filename };
    }

    // Detener grabación
    stopRecording(cameraId) {
        const recording = this.activeRecordings.get(cameraId);
        const camera = this.cameras.get(cameraId);
        if (recording?.process) {
            recording.process.kill('SIGTERM');
            this.activeRecordings.delete(cameraId);
        }
        if (camera) camera.isRecording = false;
        return { status: 'stopped' };
    }

    // Tomar screenshot
    async takeScreenshot(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (!camera) throw new Error('Cámara no encontrada');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_camera_${cameraId}_${timestamp}.jpg`;
        const outputPath = path.join(process.cwd(), 'public', 'screenshots', filename);

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', camera.rtspUrl,
                '-vframes', '1',
                '-q:v', '2',
                '-y', // Sobrescribir si existe
                outputPath
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    camera.lastScreenshot = filename;
                    resolve({ filename, path: `/screenshots/${filename}` });
                } else {
                    reject(new Error(`FFmpeg falló con código: ${code}`));
                }
            });

            ffmpeg.on('error', reject);
        });
    }

    // Obtener lista de grabaciones
    getRecordings() {
        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');

        if (!fs.existsSync(recordingsDir)) {
            fs.mkdirSync(recordingsDir, { recursive: true });
            return [];
        }

        const files = fs.readdirSync(recordingsDir);
        return files
            .filter(file => file.endsWith('.mp4'))
            .map(file => {
                const stats = fs.statSync(path.join(recordingsDir, file));
                return {
                    filename: file,
                    path: `/recordings/${file}`,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created - a.created);
    }

    // Obtener lista de screenshots
    getScreenshots() {
        const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');

        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
            return [];
        }

        const files = fs.readdirSync(screenshotsDir);
        return files
            .filter(file => file.endsWith('.jpg'))
            .map(file => {
                const stats = fs.statSync(path.join(screenshotsDir, file));
                return {
                    filename: file,
                    path: `/screenshots/${file}`,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created - a.created);
    }
}

export class PTZController {
    constructor(cameraIP, username, password, httpPort = 80) {
        this.baseUrl = `http://${cameraIP}:${httpPort}`;
        this.auth = Buffer.from(`${username}:${password}`).toString('base64');
    }

    async sendCommand(command) {
        const url = `${this.baseUrl}/cgi-bin/ptz.cgi?action=${command}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${this.auth}`
                }
            });
            return await response.text();
        } catch (error) {
            console.error('Error PTZ:', error);
            throw error;
        }
    }

    // Movimientos básicos
    async moveLeft() { return this.sendCommand('moveleft'); }
    async moveRight() { return this.sendCommand('moveright'); }
    async moveUp() { return this.sendCommand('moveup'); }
    async moveDown() { return this.sendCommand('movedown'); }
    async zoomIn() { return this.sendCommand('zoomin'); }
    async zoomOut() { return this.sendCommand('zoomout'); }
    async stop() { return this.sendCommand('stop'); }

    // Presets
    async goToPreset(presetNumber) {
        return this.sendCommand(`preset&channel=0&code=${presetNumber}&act=goto`);
    }

    async setPreset(presetNumber) {
        return this.sendCommand(`preset&channel=0&code=${presetNumber}&act=set`);
    }
}

// Instancia global del manager
export const cameraManager = new CameraManager();