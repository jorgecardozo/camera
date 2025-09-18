import { spawn } from 'child_process';
import { cameraManager } from '../../../../lib/camera-utils';

export default function handler(req, res) {
    const { id } = req.query;

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const camera = cameraManager.getCamera(id);
        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        // Headers para MJPEG stream
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });

        // Convertir RTSP a MJPEG
        const ffmpeg = spawn('ffmpeg', [
            '-i', camera.rtspUrl,
            '-c:v', 'mjpeg',
            '-q:v', '5',
            '-r', '10', // 10 fps
            '-s', '640x480',
            '-f', 'mjpeg',
            '-'
        ]);

        // Enviar frames MJPEG
        ffmpeg.stdout.on('data', (chunk) => {
            res.write(`--myboundary\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${chunk.length}\r\n\r\n`);
            res.write(chunk);
            res.write('\r\n');
        });

        ffmpeg.stderr.on('data', (data) => {
            console.error(`FFmpeg MJPEG: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            console.log(`MJPEG stream closed: ${code}`);
            if (!res.headersSent) {
                res.end();
            }
        });

        req.on('close', () => {
            ffmpeg.kill('SIGTERM');
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}