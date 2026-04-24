import { useState, useEffect, useRef } from 'react';
import { Camera, Video, Square, Trash2, Activity, Settings, Bell, BellOff } from 'lucide-react';

const VEHICLE_LABELS = new Set(['Auto', 'Camión', 'Colectivo', 'Moto', 'Bici', 'Barco', 'Avión']);
const ANIMAL_LABELS  = new Set(['Perro', 'Gato', 'Pájaro', 'Caballo']);

function boxColor(label) {
    if (label === 'Persona')         return '#f97316';
    if (VEHICLE_LABELS.has(label))   return '#60a5fa';
    if (ANIMAL_LABELS.has(label))    return '#4ade80';
    return '#e2e8f0';
}

export default function CameraStream({ camera, onUpdate }) {
    const [isLoading, setIsLoading] = useState(false);
    const [lastAction, setLastAction] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [boxes, setBoxes] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [tgToken, setTgToken] = useState(camera.telegramBotToken || '');
    const [tgChatId, setTgChatId] = useState(camera.telegramChatId || '');
    const [tgEnabled, setTgEnabled] = useState(camera.telegramEnabled ?? false);
    const boxInterval = useRef(null);

    useEffect(() => {
        if (!camera.motionActive) { setBoxes([]); return; }
        const poll = async () => {
            try {
                const r = await fetch(`/api/cameras/${camera.id}/boxes`);
                if (r.ok) { const { boxes: b } = await r.json(); setBoxes(b || []); }
            } catch (_) {}
        };
        poll();
        boxInterval.current = setInterval(poll, 400);
        return () => clearInterval(boxInterval.current);
    }, [camera.motionActive, camera.id]);

    const notify = (msg, duration = 3000) => {
        setLastAction(msg);
        if (duration) setTimeout(() => setLastAction(''), duration);
    };

    const handleScreenshot = async () => {
        setIsLoading(true);
        notify('Tomando captura...', 0);
        try {
            const res = await fetch(`/api/cameras/${camera.id}/screenshot`, { method: 'POST' });
            const result = await res.json();
            notify(res.ok ? 'Captura guardada' : `Error: ${result.error}`);
            if (res.ok) onUpdate?.();
        } catch (e) { notify(`Error: ${e.message}`); }
        finally { setIsLoading(false); }
    };

    const handleRecording = async () => {
        setIsLoading(true);
        notify(camera.isRecording ? 'Deteniendo...' : 'Iniciando grabación...', 0);
        try {
            const method = camera.isRecording ? 'DELETE' : 'POST';
            const res = await fetch(`/api/cameras/${camera.id}/recording`, { method });
            const result = await res.json();
            notify(res.ok
                ? (camera.isRecording ? 'Grabación detenida' : 'Grabación iniciada')
                : `Error: ${result.error}`);
            if (res.ok) onUpdate?.();
        } catch (e) { notify(`Error: ${e.message}`); }
        finally { setIsLoading(false); }
    };

    const handleMotion = async () => {
        try {
            const res = await fetch(`/api/cameras/${camera.id}/motion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !camera.motionDetect }),
            });
            if (res.ok) onUpdate?.();
            else notify('Error al cambiar detección');
        } catch (e) { notify(`Error: ${e.message}`); }
    };

    const handleSaveSettings = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/cameras/${camera.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramBotToken: tgToken.trim(),
                    telegramChatId: tgChatId.trim(),
                    telegramEnabled: tgEnabled,
                }),
            });
            notify(res.ok ? 'Configuración guardada' : 'Error al guardar');
            if (res.ok) setShowSettings(false);
        } catch (e) { notify(`Error: ${e.message}`); }
        finally { setIsLoading(false); }
    };

    const handleToggleTelegram = async () => {
        const next = !tgEnabled;
        setTgEnabled(next);
        try {
            await fetch(`/api/cameras/${camera.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramEnabled: next }),
            });
        } catch (_) { setTgEnabled(!next); }
    };

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setIsLoading(true);
        try {
            await fetch(`/api/cameras/${camera.id}`, { method: 'DELETE' });
            onUpdate?.();
        } catch (e) { notify(`Error: ${e.message}`); setConfirmDelete(false); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="bg-slate-800/80 rounded-2xl overflow-hidden border border-slate-700/60 flex flex-col shadow-lg">
            {/* Video */}
            <div className={`relative aspect-video bg-black ${camera.motionActive ? 'ring-2 ring-orange-500 ring-inset' : ''}`}>
                <img
                    src={`/api/cameras/${camera.id}/mjpeg`}
                    alt={camera.name}
                    className="w-full h-full object-cover"
                    onError={() => notify('Sin señal — verificá la conexión')}
                />

                {/* Bounding boxes */}
                {boxes.length > 0 && <>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {boxes.map((box, i) => (
                            <rect key={i}
                                x={`${box.x * 100}%`} y={`${box.y * 100}%`}
                                width={`${box.w * 100}%`} height={`${box.h * 100}%`}
                                fill="none" stroke={boxColor(box.label)} strokeWidth="2" rx="2"
                            />
                        ))}
                    </svg>
                    {boxes.map((box, i) => (
                        <div key={i}
                            className="absolute text-xs font-bold px-1 leading-5 rounded-sm whitespace-nowrap"
                            style={{
                                left: `${box.x * 100}%`,
                                top: box.y > 0.07
                                    ? `calc(${box.y * 100}% - 20px)`
                                    : `calc(${box.y * 100}% + 2px)`,
                                backgroundColor: boxColor(box.label),
                                color: '#fff',
                            }}
                        >
                            {box.label}{box.conf ? ` ${Math.round(box.conf * 100)}%` : ''}
                        </div>
                    ))}
                </>}

                {/* Motion badge */}
                {camera.motionActive && !camera.isRecording && (
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-orange-500/90 backdrop-blur-sm rounded-lg px-2.5 py-1">
                        <Activity size={11} className="text-white animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wider">MOVIMIENTO</span>
                    </div>
                )}

                {/* Recording badge */}
                {camera.isRecording && (
                    <div className={`absolute top-2.5 right-2.5 flex items-center gap-1.5 backdrop-blur-sm rounded-lg px-2.5 py-1 ${
                        camera.continuousRecord ? 'bg-amber-600/90' : camera.motionDetect ? 'bg-violet-600/90' : 'bg-red-600/90'
                    }`}>
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wider">
                            {camera.continuousRecord ? 'AUTO' : camera.motionDetect ? 'MOV' : 'REC'}
                        </span>
                    </div>
                )}

                {/* Bottom overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2.5">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-white font-semibold text-sm leading-tight">{camera.name}</p>
                            <p className="text-slate-400 text-xs">{camera.ip}</p>
                        </div>
                        {camera.isOnline === false ? (
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                                <span className="text-red-400 text-xs font-medium">SIN SEÑAL</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-slate-300 text-xs">EN VIVO</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div className="px-3 py-2 flex items-center gap-2 border-t border-slate-700/60">
                {/* Screenshot */}
                <button
                    onClick={handleScreenshot}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 h-10 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                >
                    <Camera size={15} />
                    <span className="hidden sm:inline">Captura</span>
                </button>

                {/* Record */}
                {camera.continuousRecord ? (
                    <div className="flex items-center gap-1.5 px-3 h-10 bg-amber-600/20 border border-amber-600/30 text-amber-300 rounded-xl text-sm font-medium">
                        <Video size={15} />
                        <span className="hidden sm:inline">Auto</span>
                    </div>
                ) : (
                    <button
                        onClick={handleRecording}
                        disabled={isLoading}
                        className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                            camera.isRecording
                                ? 'bg-red-600 hover:bg-red-500 active:bg-red-400 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-400 text-white'
                        }`}
                    >
                        {camera.isRecording ? <Square size={15} /> : <Video size={15} />}
                        <span className="hidden sm:inline">{camera.isRecording ? 'Detener' : 'Grabar'}</span>
                    </button>
                )}

                {/* Motion */}
                <button
                    onClick={handleMotion}
                    className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium transition-colors ${
                        camera.motionDetect
                            ? 'bg-violet-600 hover:bg-violet-500 active:bg-violet-400 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200'
                    }`}
                    title={camera.motionDetect ? 'Desactivar detección' : 'Activar detección'}
                >
                    <Activity size={15} />
                    <span className="hidden sm:inline">Mov.</span>
                </button>

                <div className="flex-1" />

                {/* Telegram toggle (quick) */}
                {(camera.telegramBotToken || tgToken) && (
                    <button
                        onClick={handleToggleTelegram}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                            tgEnabled
                                ? 'text-blue-400 bg-blue-500/15 hover:bg-blue-500/25'
                                : 'text-slate-600 hover:text-slate-400 hover:bg-slate-700'
                        }`}
                        title={tgEnabled ? 'Desactivar Telegram' : 'Activar Telegram'}
                    >
                        {tgEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                    </button>
                )}

                {/* Settings */}
                <button
                    onClick={() => setShowSettings(s => !s)}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                        showSettings
                            ? 'text-blue-400 bg-blue-500/15'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Configuración"
                >
                    <Settings size={16} />
                </button>

                {/* Delete */}
                {confirmDelete ? (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleDelete}
                            disabled={isLoading}
                            className="px-3 h-10 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="w-10 h-10 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs transition-colors"
                        >
                            <span>✕</span>
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleDelete}
                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                        title="Eliminar cámara"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>

            {/* Settings panel */}
            {showSettings && (
                <div className="px-4 py-4 bg-slate-900/80 border-t border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-300">Telegram</p>
                        <button
                            onClick={handleToggleTelegram}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tgEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tgEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Bot Token (ej: 123456:ABC-DEF...)"
                        value={tgToken}
                        onChange={e => setTgToken(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-xl px-3 py-2.5 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                    />
                    <input
                        type="text"
                        placeholder="Chat ID (ej: -1001234567890)"
                        value={tgChatId}
                        onChange={e => setTgChatId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-xl px-3 py-2.5 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveSettings}
                            disabled={isLoading}
                            className="flex-1 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            Guardar
                        </button>
                        {(tgToken || tgChatId) && (
                            <button
                                onClick={async () => {
                                    setTgToken(''); setTgChatId(''); setTgEnabled(false);
                                    await fetch(`/api/cameras/${camera.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ telegramBotToken: '', telegramChatId: '', telegramEnabled: false }),
                                    });
                                    notify('Telegram desactivado');
                                    setShowSettings(false);
                                }}
                                className="flex-1 h-10 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-colors"
                            >
                                Desactivar
                            </button>
                        )}
                    </div>
                    <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Crear bot en BotFather →
                    </a>
                </div>
            )}

            {/* Status bar */}
            {lastAction && (
                <div className="px-4 py-2 bg-slate-900/60 border-t border-slate-700/60">
                    <p className="text-slate-400 text-xs">{lastAction}</p>
                </div>
            )}
        </div>
    );
}
