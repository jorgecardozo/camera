import { getEvents } from '../../lib/event-store';

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    const { cameraId, limit = '50', offset = '0' } = req.query;
    const events = getEvents({
        cameraId: cameraId || undefined,
        limit: Math.min(200, parseInt(limit, 10) || 50),
        offset: parseInt(offset, 10) || 0,
    });
    res.json({ events });
}
