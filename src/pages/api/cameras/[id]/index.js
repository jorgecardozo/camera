import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';

export default function handler(req, res) {
    const { id } = req.query;

    if (req.method === 'DELETE') {
        const camera = cameraManager.getCamera(id);
        if (!camera) return res.status(404).json({ error: 'Cámara no encontrada' });

        // Stop any active streams / recordings before removing
        streamManager.stop(id);
        streamManager.stopRecorder(id);
        cameraManager.removeCamera(id);

        res.status(200).json({ message: 'Cámara eliminada' });
    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}
