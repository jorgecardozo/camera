import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';
import { motionDetector } from '../../../../lib/motion-detector';
import { requireUserId } from '../../../../lib/session';

export default async function handler(req, res) {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { id } = req.query;
    const camera = cameraManager.getCamera(id);
    if (!camera || camera.userId !== userId) {
        return res.status(404).json({ error: 'Cámara no encontrada' });
    }

    if (req.method === 'DELETE') {
        motionDetector.stop(id);
        streamManager.forceStopAll(id);
        await cameraManager.removeCamera(id);
        res.status(200).json({ message: 'Cámara eliminada' });

    } else if (req.method === 'PATCH') {
        const ALLOWED = ['telegramBotToken', 'telegramChatId', 'telegramEnabled', 'notifyObjects', 'name', 'motionDetect', 'motionSensitivity', 'continuousRecord'];
        const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => ALLOWED.includes(k)));
        await cameraManager.updateCamera(id, updates);
        res.json({ ok: true });

    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}
