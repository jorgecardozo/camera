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

        // Configurar headers para streaming
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });

        // Convertir RTSP a HTTP stream usando FFmpeg
        const ffmpeg = spawn('ffmpeg', [
            '-i', camera.rtspUrl,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-c:a', 'aac',
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov',
            '-'
        ]);

        // Pipe el output de FFmpeg a la respuesta HTTP
        ffmpeg.stdout.pipe(res);

        // Manejar errores
        ffmpeg.stderr.on('data', (data) => {
            console.error(`FFmpeg stderr: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            console.log(`FFmpeg process closed with code ${code}`);
            if (!res.headersSent) {
                res.end();
            }
        });

        // Limpiar cuando el cliente se desconecta
        req.on('close', () => {
            ffmpeg.kill('SIGTERM');
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}