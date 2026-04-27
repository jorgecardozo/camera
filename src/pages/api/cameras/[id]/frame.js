import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const camera = cameraManager.getCamera(req.query.id);
    if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

    streamManager.ensureViewer(req.query.id, camera);

    const frame = streamManager.getLastFrame(req.query.id);
    if (!frame) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).end();
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(frame);
}
