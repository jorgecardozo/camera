import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';
import { motionDetector } from '../../../../lib/motion-detector';

export default function handler(req, res) {
    const { id } = req.query;

    if (req.method === 'DELETE') {
        const camera = cameraManager.getCamera(id);
        if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

        motionDetector.stop(id);
        streamManager.forceStopAll(id);
        cameraManager.removeCamera(id);

        res.status(200).json({ message: 'Cámara eliminada' });
    } else if (req.method === 'PATCH') {
        const ALLOWED = ['telegramBotToken', 'telegramChatId', 'notifyObjects', 'name', 'motionDetect', 'motionSensitivity', 'continuousRecord'];
        const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => ALLOWED.includes(k)));
        const ok = cameraManager.updateCamera(id, updates);
        return ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Cámara no encontrada' });
    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}
