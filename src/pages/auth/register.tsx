import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Shield, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        setLoading(false);

        if (res.ok) {
            router.push('/auth/login?registered=1');
        } else {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Error al registrarse');
        }
    }

    return (
        <>
            <Head><title>Vigilancia — Crear cuenta</title></Head>
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <div className="w-full max-w-sm">
                    <div className="flex justify-center mb-6">
                        <div className="bg-blue-600 p-3 rounded-full">
                            <Shield className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white text-center mb-2">Crear cuenta</h1>
                    <p className="text-gray-400 text-center mb-8 text-sm">Vigilancia — Sistema de cámaras</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre (opcional)</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="Tu nombre"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="tu@email.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    placeholder="Mínimo 8 caracteres"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-200"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                        >
                            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                        </button>
                    </form>

                    <p className="text-gray-400 text-center mt-6 text-sm">
                        ¿Ya tenés cuenta?{' '}
                        <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">
                            Iniciar sesión
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
}
