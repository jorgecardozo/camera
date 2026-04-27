import { withAuth } from 'next-auth/middleware';
import type { NextRequest } from 'next/server';

const APP_PASSWORD = process.env.APP_PASSWORD;

// Allow Basic Auth with APP_PASSWORD (used by motion-detector for MJPEG access)
function hasValidBasicAuth(req: NextRequest): boolean {
    if (!APP_PASSWORD) return false;
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Basic ')) return false;
    try {
        const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
        const password = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded;
        return password === APP_PASSWORD;
    } catch { return false; }
}

export default withAuth({
    callbacks: {
        authorized({ token, req }) {
            // No APP_PASSWORD set → open access (dev / local-only mode)
            if (!APP_PASSWORD) return true;
            // cv2.VideoCapture can't send HTTP Basic Auth — allow all localhost requests
            const host = req.headers.get('host') ?? '';
            if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;
            // Basic Auth bypass for server-side requests (motion-detector → MJPEG)
            if (hasValidBasicAuth(req)) return true;
            // Require valid session
            return !!token;
        },
    },
    pages: { signIn: '/auth/login' },
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/|api/auth/).*)'],
};
