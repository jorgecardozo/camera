import { cameraManager } from '../../../../lib/camera-utils';
import { motionDetector } from '../../../../lib/motion-detector';

export default function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { id } = req.query;
    const camera = cameraManager.getCamera(id);
    if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

    const { enabled } = req.body;

    camera.motionDetect = !!enabled;
    cameraManager._save();

    if (enabled) {
        motionDetector.stop(id);
        motionDetector.start(id, camera);
    } else {
        motionDetector.stop(id);
    }

    res.json({ status: 'ok', motionDetect: camera.motionDetect });
}
