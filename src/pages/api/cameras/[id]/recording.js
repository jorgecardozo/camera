import { cameraManager } from '../../../../lib/camera-utils';
import { streamManager } from '../../../../lib/stream-manager';
import { requireUserId } from '../../../../lib/session';

export default async function handler(req, res) {
    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { id } = req.query;
    const camera = cameraManager.getCamera(id);
    if (!camera || camera.userId !== userId) {
        return res.status(404).json({ error: 'Cámara no encontrada' });
    }

    if (req.method === 'POST') {
        try {
            const result = streamManager.startRecorder(id, camera);
            if (result.status === 'already_recording') return res.status(409).json(result);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else if (req.method === 'DELETE') {
        try {
            const result = streamManager.stopRecorder(id);
            if (result.status === 'continuous') return res.status(409).json({ error: result.error });
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}
