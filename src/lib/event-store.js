import { prisma } from './db.js';

export async function insertEvent({ cameraId, userId, label, confidence, screenshotPath }) {
    await prisma.event.create({
        data: {
            cameraId,
            userId,
            timestamp: BigInt(Date.now()),
            label,
            confidence,
            screenshotPath: screenshotPath ?? null,
        },
    });
}

export async function getEvents({ cameraId, userId, limit = 50, offset = 0 } = {}) {
    const where = {};
    if (cameraId) where.cameraId = cameraId;
    if (userId) where.userId = userId;

    const rows = await prisma.event.findMany({
        where,
        include: { camera: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
    });

    return rows.map(e => ({
        id: e.id,
        cameraId: e.cameraId,
        cameraName: e.camera?.name ?? '',
        timestamp: Number(e.timestamp),
        label: e.label,
        confidence: e.confidence,
        screenshotPath: e.screenshotPath,
    }));
}

export async function purgeOldEvents(maxAgeMs) {
    const cutoff = BigInt(Date.now() - maxAgeMs);
    await prisma.event.deleteMany({
        where: { timestamp: { lt: cutoff } },
    });
}
