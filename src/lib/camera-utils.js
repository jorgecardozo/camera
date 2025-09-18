import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class CameraManager {
    constructor() {
        this.activeRecordings = new Map();
        this.cameras = new Map();
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
            rtspUrl: `rtsp://${config.username}:${config.password}@${config.ip}:${config.port}/live`,
            httpUrl: `http://${config.ip}:${config.httpPort || 80}`,
            isRecording: false,
            lastScreenshot: null
        });
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

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `camera_${cameraId}_${timestamp}_%03d.mp4`;
        const outputPath = path.join(process.cwd(), 'public', 'recordings', filename);

        const ffmpeg = spawn('ffmpeg', [
            '-i', camera.rtspUrl,
            '-c', 'copy',
            '-f', 'segment',
            '-segment_time', '300', // 5 minutos por segmento
            '-segment_format', 'mp4',
            '-reset_timestamps', '1',
            outputPath
        ]);

        this.activeRecordings.set(cameraId, ffmpeg);
        camera.isRecording = true;

        ffmpeg.on('error', (error) => {
            console.error(`Error en grabación cámara ${cameraId}:`, error);
        });

        ffmpeg.on('close', (code) => {
            console.log(`Grabación cámara ${cameraId} finalizada con código: ${code}`);
            this.activeRecordings.delete(cameraId);
            camera.isRecording = false;
        });

        return { status: 'started', filename };
    }

    // Detener grabación
    stopRecording(cameraId) {
        const process = this.activeRecordings.get(cameraId);
        const camera = this.cameras.get(cameraId);

        if (process) {
            process.kill('SIGTERM');
            this.activeRecordings.delete(cameraId);
        }

        if (camera) {
            camera.isRecording = false;
        }

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