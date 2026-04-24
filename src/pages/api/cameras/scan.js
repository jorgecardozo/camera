import os from 'os';
import net from 'net';
import { discoverOnvif } from '../../../lib/onvif-discovery.js';
import { probeCamera } from '../../../lib/camera-prober.js';
import { cameraManager } from '../../../lib/camera-utils.js';

function getNetworkRanges() {
    const ifaces = os.networkInterfaces();
    const ranges = [];

    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family !== 'IPv4' || iface.internal) continue;

            const parts = iface.address.split('.').map(Number);
            const maskParts = iface.netmask.split('.').map(Number);

            // Calculate CIDR prefix length
            const cidr = maskParts.reduce((acc, b) => acc + b.toString(2).split('1').length - 1, 0);

            // For /22 or larger, split into /24 chunks to keep scan manageable
            if (cidr <= 22) {
                const networkBase = parts.map((b, i) => b & maskParts[i]);
                const hostBits = 32 - cidr;
                const numHosts = Math.pow(2, hostBits);
                // Generate all /24 subnets within the range
                for (let offset = 0; offset < numHosts; offset += 256) {
                    const thirdOctet = networkBase[2] + Math.floor(offset / 256);
                    if (thirdOctet <= 255) {
                        ranges.push(`${networkBase[0]}.${networkBase[1]}.${thirdOctet}`);
                    }
                }
            } else {
                ranges.push(parts.slice(0, 3).join('.'));
            }
        }
    }

    return ranges.length > 0 ? ranges : ['192.168.1'];
}

function checkPort(host, port, timeout = 800) {
    return new Promise((resolve) => {
        const s = new net.Socket();
        let done = false;
        s.setTimeout(timeout);
        const finish = (val) => { if (!done) { done = true; s.destroy(); resolve(val); } };
        s.on('connect', () => finish(true));
        s.on('timeout', () => finish(false));
        s.on('error', () => finish(false));
        s.connect(port, host);
    });
}

async function scanSubnet(subnet) {
    const BATCH = 30;
    const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const found = [];

    for (let i = 0; i < ips.length; i += BATCH) {
        const batch = ips.slice(i, i + BATCH);
        const results = await Promise.all(
            batch.map(async (ip) => {
                const [rtsp, rtsp8554, http80, http8080] = await Promise.all([
                    checkPort(ip, 554),
                    checkPort(ip, 8554),
                    checkPort(ip, 80),
                    checkPort(ip, 8080),
                ]);
                const rtspPort = rtsp ? 554 : (rtsp8554 ? 8554 : null);
                if (rtspPort || http80 || http8080) {
                    return { ip, rtspPort, httpPort: http80 ? 80 : (http8080 ? 8080 : null) };
                }
                return null;
            })
        );
        found.push(...results.filter(Boolean));
    }

    return found;
}

async function probeBatch(cameras, port) {
    const results = [];
    for (let i = 0; i < cameras.length; i += 5) {
        const batch = cameras.slice(i, i + 5);
        const batchResults = await Promise.all(batch.map(ip => probeCamera(ip, port)));
        results.push(...batchResults.map((r, j) => ({ ip: batch[j], port, ...r })));
    }
    return results;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const subnets = req.query.subnet
        ? [req.query.subnet]
        : getNetworkRanges();

    // Load registered cameras to mark already-registered IPs
    const registeredCameras = cameraManager.getAllCameras();
    const registeredIps = new Set(registeredCameras.map(c => c.ip));

    // Run TCP port scan and ONVIF discovery in parallel
    const [tcpFound, onvifDevices] = await Promise.all([
        (async () => {
            const allFound = [];
            for (const subnet of subnets) {
                const found = await scanSubnet(subnet);
                allFound.push(...found);
            }
            return allFound;
        })(),
        discoverOnvif(),
    ]);

    // Merge ONVIF-discovered IPs into the TCP results (avoid duplicates)
    const tcpIpSet = new Set(tcpFound.map(r => r.ip));
    for (const device of onvifDevices) {
        if (!tcpIpSet.has(device.ip)) {
            // Add as an HTTP-only device (ONVIF typically uses HTTP port 80)
            tcpFound.push({ ip: device.ip, rtspPort: null, httpPort: 80, discoveredVia: 'onvif' });
            tcpIpSet.add(device.ip);
        }
    }

    // Separate cameras with RTSP from non-RTSP devices
    const rtspCameras = tcpFound.filter(r => r.rtspPort);
    const nonRtspDevices = tcpFound.filter(r => !r.rtspPort);

    // Probe RTSP cameras that are not already registered
    const toProbe = rtspCameras.filter(r => !registeredIps.has(r.ip));
    const alreadyRegistered = rtspCameras.filter(r => registeredIps.has(r.ip));

    // Run credential probing in batches of 5
    const probeResults = new Map();
    for (let i = 0; i < toProbe.length; i += 5) {
        const batch = toProbe.slice(i, i + 5);
        const batchResults = await Promise.all(
            batch.map(cam => probeCamera(cam.ip, cam.rtspPort))
        );
        for (let j = 0; j < batch.length; j++) {
            probeResults.set(batch[j].ip, batchResults[j]);
        }
    }

    // Build final result list
    const allFound = [];

    // Already-registered cameras
    for (const cam of alreadyRegistered) {
        allFound.push({ ...cam, status: 'already_registered' });
    }

    // Probed cameras (verified or unknown)
    for (const cam of toProbe) {
        const probeResult = probeResults.get(cam.ip) || { status: 'unknown' };
        allFound.push({ ...cam, ...probeResult });
    }

    // Non-RTSP devices — mark already_registered if applicable, otherwise no status
    for (const device of nonRtspDevices) {
        if (registeredIps.has(device.ip)) {
            allFound.push({ ...device, status: 'already_registered' });
        } else {
            allFound.push({ ...device });
        }
    }

    res.status(200).json({
        subnets,
        found: allFound,
    });
}
