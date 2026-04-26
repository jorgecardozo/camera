import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Contraseña', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;
                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                });
                if (!user) return null;
                const valid = await bcrypt.compare(credentials.password, user.password);
                if (!valid) return null;
                return { id: user.id, email: user.email, name: user.name };
            },
        }),
    ],
    session: { strategy: 'jwt' },
    pages: { signIn: '/auth/login' },
    callbacks: {
        async jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        async session({ session, token }) {
            if (token?.id) session.user.id = token.id;
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};
