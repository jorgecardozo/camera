import { spawn } from 'child_process';
import { CAMERA_PROFILES } from './camera-profiles.js';

const PROBE_TIMEOUT_MS = 3000;

function probeRtsp(url) {
    return new Promise((resolve) => {
        const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-t', '2', url];
        const proc = spawn('ffprobe', args);
        const timer = setTimeout(() => { proc.kill('SIGTERM'); resolve(false); }, PROBE_TIMEOUT_MS);
        proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
        proc.on('error', () => { clearTimeout(timer); resolve(false); });
    });
}

export async function probeCamera(ip, port = 554) {
    for (const profile of CAMERA_PROFILES) {
        for (const [user, pass] of profile.credentials) {
            for (const rtspPath of profile.rtspPaths) {
                const credentials = user || pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
                const url = `rtsp://${credentials}${ip}:${port}${rtspPath}`;
                const ok = await probeRtsp(url);
                if (ok) {
                    return {
                        status: 'verified',
                        brand: profile.brand,
                        username: user,
                        password: pass,
                        rtspPath,
                        rtspUrl: `rtsp://${user}:${pass}@${ip}:${port}${rtspPath}`,
                    };
                }
            }
        }
    }
    return { status: 'unknown' };
}
