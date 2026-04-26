import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth.js';
import { LOCAL_USER_ID } from './db.js';

// Returns the user ID to use for data scoping.
//
// Single-user mode (Cloudflare Tunnel): APP_PASSWORD is set, but all data lives
// under LOCAL_USER_ID. NextAuth is just the login gate — whoever is logged in
// accesses the same local data. This is the right model when one person owns
// the machine and cameras.
//
// Dev mode: APP_PASSWORD empty → skip auth entirely, use LOCAL_USER_ID.
export async function requireUserId(req, res) {
    if (!process.env.APP_PASSWORD) return LOCAL_USER_ID;

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        res.status(401).json({ error: 'No autenticado' });
        return null;
    }

    // Single-user: all data is under LOCAL_USER_ID regardless of which account logged in
    return LOCAL_USER_ID;
}
