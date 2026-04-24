import { cameraManager } from '../../lib/camera-utils';
import { getRetentionStatus, getDiskStatus } from '../../lib/retention';

export default function handler(req, res) {
    if (req.method === 'GET') {
        const { type } = req.query;

        try {
            if (type === 'recordings') {
                const recordings = cameraManager.getRecordings();
                res.status(200).json({ recordings });
            } else if (type === 'screenshots') {
                const screenshots = cameraManager.getScreenshots();
                res.status(200).json({ screenshots });
            } else if (type === 'retention-status') {
                res.status(200).json(getRetentionStatus());
            } else if (type === 'disk-status') {
                const status = getDiskStatus();
                if (!status) return res.status(503).json({ error: 'No se pudo leer el disco' });
                res.status(200).json(status);
            } else {
                res.status(400).json({ error: 'Tipo no válido. Use: recordings, screenshots o retention-status' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}