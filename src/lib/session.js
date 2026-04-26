import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth.js';
import { LOCAL_USER_ID } from './db.js';

// Returns the session user ID, or sends 401 and returns null.
// When APP_PASSWORD is not set (dev / local-only mode), falls back to LOCAL_USER_ID.
export async function requireUserId(req, res) {
    if (!process.env.APP_PASSWORD) return LOCAL_USER_ID;

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        res.status(401).json({ error: 'No autenticado' });
        return null;
    }
    return session.user.id;
}
