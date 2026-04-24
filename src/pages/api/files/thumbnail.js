import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const RECORDINGS_DIR = path.join(process.cwd(), 'public', 'recordings');
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const { filename } = req.query;
    if (!filename || typeof filename !== 'string') return res.status(400).end();

    // Guard against path traversal
    const videoPath = path.resolve(RECORDINGS_DIR, filename);
    if (!videoPath.startsWith(RECORDINGS_DIR + path.sep)) return res.status(400).end();
    if (!fs.existsSync(videoPath)) return res.status(404).end();

    if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

    const thumbName = filename.replace(/\.[^.]+$/, '.jpg');
    const thumbPath = path.join(THUMBNAILS_DIR, thumbName);

    const send = () => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        fs.createReadStream(thumbPath).pipe(res);
    };

    if (fs.existsSync(thumbPath)) return send();

    // Extract frame at 2s (avoids blank frames at the very start)
    const ffmpeg = spawn('ffmpeg', [
        '-ss', '2',
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=640:-1',
        '-q:v', '5',
        '-update', '1',
        '-y',
        thumbPath,
    ]);

    ffmpeg.on('close', (code) => {
        if (code !== 0 || !fs.existsSync(thumbPath)) return res.status(500).end();
        send();
    });

    // If ffmpeg crashes before close fires, avoid hanging the request
    ffmpeg.on('error', () => res.status(500).end());
}
