import { cameraManager } from '../../../../lib/camera-utils';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'POST') {
    try {
      const result = await cameraManager.takeScreenshot(id);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Método no permitido' });
  }
}