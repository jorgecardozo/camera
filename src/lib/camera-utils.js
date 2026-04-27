import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma, LOCAL_USER_ID, ensureLocalUser } from './db.js';
import { encryptCredentials, decryptCredentials } from './crypto.js';
import './retention'; // register startup cleanup + hourly interval

export function buildRtspUrl(config) {
    const host  = `${config.ip}:${config.port || 554}`;
    const rtspPath = config.rtspPath || '/live';
    const user  = config.username || '';
    const pass  = config.password || '';
    if (user || pass) return `rtsp://${user}:${pass}@${host}${rtspPath}`;
    return `rtsp://${host}${rtspPath}`;
}

function toRuntimeCamera(dbCam) {
    const { username = '', password = '' } = decryptCredentials(dbCam.credentialsEncrypted);
    return {
        id: dbCam.id,
        userId: dbCam.userId,
        name: dbCam.name,
        ip: dbCam.ip,
        port: dbCam.port,
        httpPort: dbCam.httpPort,
        rtspPath: dbCam.rtspPath,
        credentialsEncrypted: dbCam.credentialsEncrypted,
        rtspUrl: buildRtspUrl({ ip: dbCam.ip, port: dbCam.port, rtspPath: dbCam.rtspPath, username, password }),
        httpUrl: `http://${dbCam.ip}:${dbCam.httpPort}`,
        continuousRecord: dbCam.continuousRecord,
        manualRecording: dbCam.manualRecording,
        motionDetect: dbCam.motionDetect,
        motionSensitivity: dbCam.motionSensitivity,
        telegramBotToken: dbCam.telegramBotToken,
        telegramChatId: dbCam.telegramChatId,
        telegramEnabled: dbCam.telegramEnabled,
        notifyObjects: dbCam.notifyObjects,
        // Runtime-only — always reset on server start
        isRecording: false,
        motionActive: false,
        motionBoxes: [],
        isOnline: false,
        lastScreenshot: null,
    };
}

export class CameraManager {
    constructor() {
        this.cameras = new Map();
    }

    async loadFromDb() {
        const rows = await prisma.camera.findMany();
        for (const row of rows) {
            this.cameras.set(row.id, toRuntimeCamera(row));
        }
    }

    async registerCamera(id, config, userId = LOCAL_USER_ID) {
        const { username = '', password = '' } = config;
        const credentialsEncrypted = (username || password)
            ? encryptCredentials({ username, password })
            : '';

        const dbCam = await prisma.camera.create({
            data: {
                id,
                userId,
                name: config.name,
                ip: config.ip,
                port: config.port || 554,
                httpPort: config.httpPort || 80,
                rtspPath: config.rtspPath || '/live',
                credentialsEncrypted,
                continuousRecord: !!config.continuousRecord,
                motionDetect: !!config.motionDetect,
                motionSensitivity: config.motionSensitivity ?? 0.12,
                telegramBotToken: config.telegramBotToken || '',
                telegramChatId: config.telegramChatId || '',
                telegramEnabled: config.telegramEnabled ?? false,
                notifyObjects: config.notifyObjects || null,
            },
        });

        this.cameras.set(id, toRuntimeCamera(dbCam));
    }

    async updateCamera(id, fields) {
        const cam = this.cameras.get(id);
        if (!cam) return false;

        const runtimeOnly = new Set([
            'isRecording', 'motionActive', 'motionBoxes', 'isOnline',
            'lastScreenshot', 'rtspUrl', 'httpUrl', 'credentialsEncrypted',
            'userId',
        ]);

        const dbFields = {};
        for (const [k, v] of Object.entries(fields)) {
            if (!runtimeOnly.has(k)) dbFields[k] = v;
        }

        if ('username' in fields || 'password' in fields) {
            const { username: oldUser = '', password: oldPass = '' } = decryptCredentials(cam.credentialsEncrypted || '');
            const newUser = fields.username ?? oldUser;
            const newPass = fields.password ?? oldPass;
            dbFields.credentialsEncrypted = encryptCredentials({ username: newUser, password: newPass });
            delete dbFields.username;
            delete dbFields.password;
        }

        if (Object.keys(dbFields).length > 0) {
            await prisma.camera.update({ where: { id }, data: dbFields });
            if (dbFields.credentialsEncrypted !== undefined) {
                cam.credentialsEncrypted = dbFields.credentialsEncrypted;
            }
        }

        Object.assign(cam, fields);

        // Rebuild rtspUrl if connection params changed
        if ('ip' in fields || 'port' in fields || 'rtspPath' in fields ||
            'username' in fields || 'password' in fields) {
            const { username = '', password = '' } = decryptCredentials(cam.credentialsEncrypted || '');
            cam.rtspUrl = buildRtspUrl({ ip: cam.ip, port: cam.port, rtspPath: cam.rtspPath, username, password });
        }

        return true;
    }

    async removeCamera(id) {
        await prisma.camera.delete({ where: { id } });
        this.cameras.delete(id);
    }

    getAllCameras(userId) {
        const all = Array.from(this.cameras.values());
        return userId ? all.filter(c => c.userId === userId) : all;
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

export const cameraManager = new CameraManager();

// On module init: seed local user then load all cameras from DB
ensureLocalUser()
    .then(() => cameraManager.loadFromDb())
    .catch(err => console.error('[camera] DB init failed:', err.message));
