import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';

function createPrismaClient() {
    const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Temporary local user for single-user mode (replaced by real auth in U4)
export const LOCAL_USER_ID = 'local';

export async function ensureLocalUser() {
    await prisma.user.upsert({
        where: { id: LOCAL_USER_ID },
        create: {
            id: LOCAL_USER_ID,
            email: 'local@localhost',
            name: 'Local User',
            password: 'local',
        },
        update: {},
    });
    return LOCAL_USER_ID;
}
