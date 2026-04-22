import os from 'os';
import net from 'net';

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

function checkPort(host, port, timeout = 1500) {
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

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const subnets = req.query.subnet
        ? [req.query.subnet]
        : getNetworkRanges();

    const allFound = [];
    for (const subnet of subnets) {
        const found = await scanSubnet(subnet);
        allFound.push(...found);
    }

    res.status(200).json({
        subnets,
        found: allFound,
    });
}
