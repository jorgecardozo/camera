import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/db';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { email, password, name } = req.body ?? {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
        data: { email, password: hashed, name: name || null },
        select: { id: true, email: true, name: true },
    });

    res.status(201).json(user);
}
