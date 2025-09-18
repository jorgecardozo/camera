import { cameraManager } from '../../lib/camera-utils';

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
            } else {
                res.status(400).json({ error: 'Tipo no válido. Use: recordings o screenshots' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}