import { cameraManager } from '../../../../lib/camera-utils';

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    const camera = cameraManager.getCamera(req.query.id);
    if (!camera) return res.status(404).json({ boxes: [] });
    res.json({ boxes: camera.motionBoxes || [] });
}
