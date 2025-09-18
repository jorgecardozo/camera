import { PTZController } from '../../../../lib/camera-utils';
import { cameraManager } from '../../../../lib/camera-utils';

export default async function handler(req, res) {
    const { id } = req.query;
    const { action, preset } = req.body;

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const camera = cameraManager.getCamera(id);
        if (!camera) {
            return res.status(404).json({ error: 'Cámara no encontrada' });
        }

        const ptz = new PTZController(
            camera.ip,
            camera.username,
            camera.password,
            camera.httpPort || 80
        );

        let result;

        switch (action) {
            case 'left':
                result = await ptz.moveLeft();
                break;
            case 'right':
                result = await ptz.moveRight();
                break;
            case 'up':
                result = await ptz.moveUp();
                break;
            case 'down':
                result = await ptz.moveDown();
                break;
            case 'zoomin':
                result = await ptz.zoomIn();
                break;
            case 'zoomout':
                result = await ptz.zoomOut();
                break;
            case 'stop':
                result = await ptz.stop();
                break;
            case 'preset':
                if (preset !== undefined) {
                    result = await ptz.goToPreset(preset);
                } else {
                    return res.status(400).json({ error: 'Número de preset requerido' });
                }
                break;
            case 'setpreset':
                if (preset !== undefined) {
                    result = await ptz.setPreset(preset);
                } else {
                    return res.status(400).json({ error: 'Número de preset requerido' });
                }
                break;
            default:
                return res.status(400).json({ error: 'Acción no válida' });
        }

        res.status(200).json({
            status: 'success',
            action,
            camera: id,
            result
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}