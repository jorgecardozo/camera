import { WebSocketServer } from 'ws';
import { cameraManager } from './camera-utils';
import { streamManager } from './stream-manager';

let wss = null;

export function initWsServer(httpServer) {
    if (wss) return;

    wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
        const match = req.url?.match(/\/api\/cameras\/([^/?#]+)\/ws(?:[?#]|$)/);
        if (!match) return;

        wss.handleUpgrade(req, socket, head, (ws) => {
            const cameraId = decodeURIComponent(match[1]);
            const camera = cameraManager.getCamera(cameraId);
            if (!camera) { ws.close(1008, 'Camera not found'); return; }
            streamManager.addWsClient(cameraId, camera, ws);
        });
    });

    console.log('[ws-server] WebSocket server inicializado');
}
