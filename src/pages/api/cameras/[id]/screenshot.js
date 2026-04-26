import { cameraManager } from '../../../../lib/camera-utils';
import { requireUserId } from '../../../../lib/session';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { id } = req.query;
    const camera = cameraManager.getCamera(id);
    if (!camera || camera.userId !== userId) {
        return res.status(404).json({ error: 'Cámara no encontrada' });
    }

    try {
        const result = await cameraManager.takeScreenshot(id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
