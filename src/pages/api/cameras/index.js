import { cameraManager } from '../../../lib/camera-utils';
import { LOCAL_USER_ID } from '../../../lib/db';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const cameras = cameraManager.getAllCameras(LOCAL_USER_ID);
        res.status(200).json({ cameras });

    } else if (req.method === 'POST') {
        try {
            const { id, name, ip, port, username, password, httpPort, rtspPath, continuousRecord } = req.body;

            await cameraManager.registerCamera(id, {
                name,
                ip,
                port: port || 554,
                username,
                password,
                httpPort: httpPort || 80,
                rtspPath: rtspPath || '/live',
                continuousRecord: !!continuousRecord,
            }, LOCAL_USER_ID);

            res.status(201).json({
                message: 'Cámara registrada exitosamente',
                camera: cameraManager.getCamera(id),
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }

    } else {
        res.status(405).json({ message: 'Método no permitido' });
    }
}
