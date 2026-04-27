import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Shield, Eye, EyeOff, Camera, Bell, Lock } from 'lucide-react';
import { authOptions } from '../../lib/auth';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getServerSession(ctx.req, ctx.res, authOptions as any);
    if (session) return { redirect: { destination: '/', permanent: false } };
    return { props: {} };
};

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const registered = router.query.registered === '1';

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await signIn('credentials', { email, password, redirect: false });
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
            <div className="auth-bg min-h-screen flex">

                {/* Brand panel — desktop only */}
                <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12
                    bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">

                    {/* Background grid pattern */}
                    <div className="absolute inset-0 opacity-10"
                        style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

                    <div className="relative">
                        <div className="flex items-center gap-3 mb-16">
                            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-white font-bold text-xl tracking-tight">Vigilancia</span>
                        </div>

                        <h2 className="text-white text-4xl font-bold leading-tight mb-4">
                            Tu seguridad,<br />bajo tu control.
                        </h2>
                        <p className="text-slate-400 text-lg leading-relaxed">
                            Sistema de vigilancia IP con detección de movimiento inteligente y notificaciones en tiempo real.
                        </p>

                        <div className="mt-12 space-y-5">
                            {[
                                { icon: Camera, label: 'Múltiples cámaras WiFi', desc: 'Compatible con cualquier cámara RTSP' },
                                { icon: Bell, label: 'Alertas por Telegram', desc: 'Notificaciones instantáneas con foto' },
                                { icon: Lock, label: 'Acceso seguro', desc: 'Tus grabaciones, solo para vos' },
                            ].map(({ icon: Icon, label, desc }) => (
                                <div key={label} className="flex items-start gap-4">
                                    <div className="w-9 h-9 bg-blue-500/15 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                        <Icon className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="text-white font-medium text-sm">{label}</div>
                                        <div className="text-slate-500 text-sm">{desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="relative text-slate-600 text-sm">© 2026 Vigilancia</p>
                </div>

                {/* Form panel */}
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-12">

                    {/* Mobile logo */}
                    <div className="lg:hidden mb-8 text-center">
                        <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center shadow-lg shadow-blue-600/30 mb-4">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Vigilancia</h1>
                        <p className="text-slate-500 text-sm mt-1">Sistema de cámaras de seguridad</p>
                    </div>

                    <div className="w-full max-w-sm">
                        <div className="mb-8 lg:block hidden">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Bienvenido</h2>
                            <p className="text-slate-500 text-sm mt-1">Ingresá para acceder a tus cámaras</p>
                        </div>

                        {registered && (
                            <div className="mb-5 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm">
                                ¡Cuenta creada! Ya podés iniciar sesión.
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    placeholder="tu@email.com"
                                    className="w-full px-4 py-3 rounded-xl border
                                        bg-white dark:bg-slate-800/80
                                        border-slate-200 dark:border-slate-700
                                        text-slate-900 dark:text-white
                                        placeholder-slate-400 dark:placeholder-slate-500
                                        focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500
                                        transition-colors"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 pr-12 rounded-xl border
                                            bg-white dark:bg-slate-800/80
                                            border-slate-200 dark:border-slate-700
                                            text-slate-900 dark:text-white
                                            placeholder-slate-400 dark:placeholder-slate-500
                                            focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500
                                            transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute inset-y-0 right-0 px-4 flex items-center
                                            text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700
                                    disabled:opacity-60 text-white font-semibold rounded-xl
                                    shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30
                                    transition-all duration-150 mt-2"
                            >
                                {loading ? 'Ingresando...' : 'Iniciar sesión'}
                            </button>
                        </form>

                        <p className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
                            ¿No tenés cuenta?{' '}
                            <Link href="/auth/register"
                                className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                                Registrarse
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
