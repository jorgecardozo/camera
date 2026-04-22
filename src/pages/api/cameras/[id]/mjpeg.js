import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const camera = cameraManager.getCamera(req.query.id);
    if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
    });

    streamManager.addClient(req.query.id, camera, res);
}
