import { getLogs } from '../../lib/log-buffer';

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    const last  = Math.min(parseInt(req.query.last  || '300', 10), 600);
    const since = parseInt(req.query.since || '-1', 10);
    res.setHeader('Cache-Control', 'no-store');
    res.json(getLogs(last, since));
}
