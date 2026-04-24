import { cameraManager } from '../../../lib/camera-utils';

export default function handler(req, res) {
    if (req.method === 'GET') {
        // Obtener todas las cámaras
        const cameras = cameraManager.getAllCameras();
        res.status(200).json({ cameras });

    } else if (req.method === 'POST') {
        // Registrar nueva cámara
        try {
            const { id, name, ip, port, username, password, httpPort, rtspPath, continuousRecord } = req.body;

            cameraManager.registerCamera(id, {
                name,
                ip,
                port: port || 554,
                username,
                password,
                httpPort: httpPort || 80,
                rtspPath: rtspPath || '/live',
                continuousRecord: !!continuousRecord,
            });

            res.status(201).json({
                message: 'Cámara registrada exitosamente',
                camera: cameraManager.getCamera(id)
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}