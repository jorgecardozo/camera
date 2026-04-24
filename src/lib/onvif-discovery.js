import dgram from 'dgram';

const WS_DISCOVERY_ADDR = '239.255.255.250';
const WS_DISCOVERY_PORT = 3702;
const TIMEOUT_MS = 3000;

const PROBE_MSG = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${Math.random().toString(36).slice(2)}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;

export function discoverOnvif() {
    return new Promise((resolve) => {
        const devices = [];
        const seenAddresses = new Set();
        const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        const done = () => {
            try { sock.close(); } catch (_) {}
            resolve(devices);
        };

        const timer = setTimeout(done, TIMEOUT_MS);

        sock.on('error', () => { clearTimeout(timer); done(); });

        sock.on('message', (msg) => {
            try {
                const text = msg.toString('utf8');
                // Extract XAddrs (device service address)
                const xaddrsMatch = text.match(/<[^>]*XAddrs[^>]*>([^<]+)/i);
                if (!xaddrsMatch) return;
                const xaddrs = xaddrsMatch[1].trim();
                // Extract IP from XAddrs
                const ipMatch = xaddrs.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                if (!ipMatch) return;
                const ip = ipMatch[1];
                if (seenAddresses.has(ip)) return;
                seenAddresses.add(ip);
                devices.push({ ip, xaddrs, discoveredVia: 'onvif' });
            } catch (_) {}
        });

        sock.bind(() => {
            const probe = Buffer.from(PROBE_MSG);
            sock.send(probe, 0, probe.length, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDR, (err) => {
                if (err) { clearTimeout(timer); done(); }
            });
        });
    });
}
