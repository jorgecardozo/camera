const NOTIFY_OBJECTS = new Set(['Persona', 'Auto', 'Camión', 'Moto', 'Colectivo']);
const COOLDOWN_MS = 30_000;

class NotificationManager {
    constructor() {
        this.lastSentAt = new Map(); // cameraId → timestamp
    }

    async notify(cameraId, camera, boxes, jpegBuffer) {
        if (!camera.telegramEnabled) return;
        if (!camera.telegramBotToken || !camera.telegramChatId) return;

        const allowedObjects = camera.notifyObjects ? new Set(camera.notifyObjects) : NOTIFY_OBJECTS;
        const relevantBox = boxes.find(b => allowedObjects.has(b.label));
        if (!relevantBox) return;

        const now = Date.now();
        const last = this.lastSentAt.get(cameraId) ?? 0;
        if (now - last < COOLDOWN_MS) return;
        this.lastSentAt.set(cameraId, now);

        const caption = `[${camera.name}] ${relevantBox.label} (${Math.round(relevantBox.conf * 100)}%) — ${new Date().toLocaleTimeString('es-AR')}`;
        const token = camera.telegramBotToken;
        const chatId = camera.telegramChatId;

        try {
            if (jpegBuffer) {
                // Send photo with caption
                const form = new FormData();
                form.append('chat_id', chatId);
                form.append('caption', caption);
                form.append('photo', new Blob([jpegBuffer], { type: 'image/jpeg' }), 'frame.jpg');
                await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
            } else {
                // Fallback: text only
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: caption }),
                });
            }
        } catch (err) {
            console.error('[telegram] Error al enviar notificación:', err.message);
        }
    }
}

export const notificationManager = new NotificationManager();
