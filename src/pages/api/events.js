import { getEvents } from '../../lib/event-store';
import { requireUserId } from '../../lib/session';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const { cameraId, limit = '50', offset = '0' } = req.query;
    const events = await getEvents({
        cameraId: cameraId || undefined,
        userId,
        limit: Math.min(200, parseInt(limit, 10) || 50),
        offset: parseInt(offset, 10) || 0,
    });
    res.json({ events });
}
