import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Shield } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });
        setLoading(false);
        if (result?.error) {
            setError('Email o contraseña incorrectos');
        } else {
            router.push('/');
        }
    }

    return (
        <>
            <Head><title>Vigilancia — Iniciar sesión</title></Head>
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <div className="w-full max-w-sm">
                    <div className="flex justify-center mb-6">
                        <div className="bg-blue-600 p-3 rounded-full">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white text-center mb-2">Vigilancia</h1>
                    <p className="text-gray-400 text-center mb-8 text-sm">Sistema de cámaras de seguridad</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoFocus
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="tu@email.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                        >
                            {loading ? 'Ingresando...' : 'Iniciar sesión'}
                        </button>
                    </form>

                    <p className="text-gray-400 text-center mt-6 text-sm">
                        ¿No tenés cuenta?{' '}
                        <Link href="/auth/register" className="text-blue-400 hover:text-blue-300">
                            Registrarse
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
}
