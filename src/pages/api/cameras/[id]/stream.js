import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';

export const config = { api: { responseLimit: false } };

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const camera = cameraManager.getCamera(req.query.id);
    if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    streamManager.addSseClient(req.query.id, camera, res);
}
