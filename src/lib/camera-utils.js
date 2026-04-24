import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import './retention'; // register startup cleanup + hourly interval

const CAMERAS_FILE = path.join(process.cwd(), 'cameras.json');

function buildRtspUrl(config) {
    const host = `${config.ip}:${config.port || 554}`;
    const path_ = config.rtspPath || '/live';
    const user  = config.username || '';
    const pass  = config.password || '';
    if (user || pass) return `rtsp://${user}:${pass}@${host}${path_}`;
    return `rtsp://${host}${path_}`;
}

export class CameraManager {
    constructor() {
        this.cameras = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(CAMERAS_FILE)) {
                const data = JSON.parse(fs.readFileSync(CAMERAS_FILE, 'utf-8'));
                const map = new Map();
                for (const cam of data) {
                    map.set(cam.id, {
                        ...cam,
                        isRecording: false,          // reset on startup — recorder must be re-started explicitly
                        continuousRecord: cam.continuousRecord ?? false,
                        motionDetect: cam.motionDetect ?? false,
                        motionSensitivity: cam.motionSensitivity ?? 0.05,
                        telegramBotToken: cam.telegramBotToken || '',
                        telegramChatId: cam.telegramChatId || '',
                        notifyObjects: cam.notifyObjects || null,
                        // Runtime-only fields — always reset on startup
                        motionActive: false,
                        motionBoxes: [],
                        isOnline: false,
                    });
                }
                return map;
            }
        } catch (_) {}
        return new Map();
    }

    _save() {
        const data = Array.from(this.cameras.values()).map(({ motionActive, motionBoxes, isOnline, ...cam }) => cam);
        const tmp = CAMERAS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, CAMERAS_FILE);
    }

    registerCamera(id, config) {
        this.cameras.set(id, {
            id,
            name: config.name,
            ip: config.ip,
            port: config.port || 554,
            username: config.username,
            password: config.password,
            httpPort: config.httpPort || 80,
            rtspUrl: buildRtspUrl(config),
            httpUrl: `http://${config.ip}:${config.httpPort || 80}`,
            isRecording: false,
            continuousRecord: !!config.continuousRecord,
            motionDetect: !!config.motionDetect,
            motionSensitivity: config.motionSensitivity ?? 0.05,
            telegramBotToken: config.telegramBotToken || '',
            telegramChatId: config.telegramChatId || '',
            notifyObjects: config.notifyObjects || null,
            lastScreenshot: null,
        });
        this._save();
    }

    updateCamera(id, fields) {
        const cam = this.cameras.get(id);
        if (!cam) return false;
        Object.assign(cam, fields);
        this._save();
        return true;
    }

    removeCamera(id) {
        this.cameras.delete(id);
        this._save();
    }

    getAllCameras() {
        return Array.from(this.cameras.values());
    }

    getCamera(id) {
        return this.cameras.get(id);
    }

    async takeScreenshot(cameraId) {
        const camera = this.cameras.get(cameraId);
        if (!camera) throw new Error('Cámara no encontrada');

        const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
        fs.mkdirSync(screenshotsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_camera_${cameraId}_${timestamp}.jpg`;
        const outputPath = path.join(screenshotsDir, filename);

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-fflags', 'nobuffer',
                '-rtsp_transport', 'tcp',
                '-i', camera.rtspUrl,
                '-vframes', '1',
                '-q:v', '2',
                '-y',
                outputPath,
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

    saveFrame(cameraId, jpegBuffer) {
        const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
        fs.mkdirSync(screenshotsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_camera_${cameraId}_${timestamp}.jpg`;
        fs.writeFileSync(path.join(screenshotsDir, filename), jpegBuffer);
        const cam = this.cameras.get(cameraId);
        if (cam) cam.lastScreenshot = filename;
        return { filename, path: `/screenshots/${filename}` };
    }

    getRecordings() {
        const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
        if (!fs.existsSync(recordingsDir)) {
            fs.mkdirSync(recordingsDir, { recursive: true });
            return [];
        }
        return fs.readdirSync(recordingsDir)
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const stats = fs.statSync(path.join(recordingsDir, f));
                return { filename: f, path: `/recordings/${f}`, size: stats.size, created: stats.birthtime };
            })
            .sort((a, b) => b.created - a.created);
    }

    getScreenshots() {
        const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
            return [];
        }
        return fs.readdirSync(screenshotsDir)
            .filter(f => f.endsWith('.jpg'))
            .map(f => {
                const stats = fs.statSync(path.join(screenshotsDir, f));
                return { filename: f, path: `/screenshots/${f}`, size: stats.size, created: stats.birthtime };
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
                headers: { 'Authorization': `Basic ${this.auth}` },
            });
            return await response.text();
        } catch (error) {
            console.error('Error PTZ:', error);
            throw error;
        }
    }

    async moveLeft() { return this.sendCommand('moveleft'); }
    async moveRight() { return this.sendCommand('moveright'); }
    async moveUp() { return this.sendCommand('moveup'); }
    async moveDown() { return this.sendCommand('movedown'); }
    async zoomIn() { return this.sendCommand('zoomin'); }
    async zoomOut() { return this.sendCommand('zoomout'); }
    async stop() { return this.sendCommand('stop'); }

    async goToPreset(presetNumber) {
        return this.sendCommand(`preset&channel=0&code=${presetNumber}&act=goto`);
    }

    async setPreset(presetNumber) {
        return this.sendCommand(`preset&channel=0&code=${presetNumber}&act=set`);
    }
}

export const cameraManager = new CameraManager();
