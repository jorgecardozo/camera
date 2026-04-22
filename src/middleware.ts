import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_PASSWORD = process.env.APP_PASSWORD;

export function middleware(req: NextRequest) {
    if (!APP_PASSWORD) return NextResponse.next();

    const auth = req.headers.get('authorization') ?? '';
    if (auth.startsWith('Basic ')) {
        try {
            const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
            // Accept any username; only the password is checked.
            const password = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded;
            if (password === APP_PASSWORD) return NextResponse.next();
        } catch (_) {}
    }

    return new NextResponse('Acceso denegado', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Vigilancia"' },
    });
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
