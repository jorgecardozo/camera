import { cameraManager } from '../../../../lib/camera-utils';
import { requireUserId } from '../../../../lib/session';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const camera = cameraManager.getCamera(req.query.id);
    if (!camera || camera.userId !== userId) {
        return res.status(404).json({ boxes: [] });
    }
    res.json({ boxes: camera.motionBoxes || [] });
}
