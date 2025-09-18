import { cameraManager } from '../../../../lib/camera-utils';

export default function handler(req, res) {
    const { id } = req.query;

    if (req.method === 'POST') {
        // Iniciar grabación
        try {
            const result = cameraManager.startRecording(id);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else if (req.method === 'DELETE') {
        // Detener grabación
        try {
            const result = cameraManager.stopRecording(id);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}