import { useState, useEffect, useRef } from 'react';
import { Camera, Video, Square, Trash2, Activity, Settings } from 'lucide-react';

const VEHICLE_LABELS = new Set(['Auto', 'Camión', 'Colectivo', 'Moto', 'Bici', 'Barco', 'Avión']);
const ANIMAL_LABELS  = new Set(['Perro', 'Gato', 'Pájaro', 'Caballo']);

function boxColor(label) {
    if (label === 'Persona')          return '#f97316'; // orange
    if (VEHICLE_LABELS.has(label))    return '#60a5fa'; // blue
    if (ANIMAL_LABELS.has(label))     return '#4ade80'; // green
    return '#e2e8f0';                                   // slate
}

export default function CameraStream({ camera, onUpdate }) {
    const [isLoading, setIsLoading] = useState(false);
    const [lastAction, setLastAction] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [boxes, setBoxes] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [tgToken, setTgToken] = useState(camera.telegramBotToken || '');
    const [tgChatId, setTgChatId] = useState(camera.telegramChatId || '');
    const boxInterval = useRef(null);

    useEffect(() => {
        if (!camera.motionActive) {
            setBoxes([]);
            return;
        }
        const poll = async () => {
            try {
                const r = await fetch(`/api/cameras/${camera.id}/boxes`);
                if (r.ok) {
                    const { boxes: b } = await r.json();
                    setBoxes(b || []);
                }
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
            notify(res.ok ? `Captura guardada` : `Error: ${result.error}`);
            if (res.ok) onUpdate?.();
        } catch (e) {
            notify(`Error: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
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
                : `Error: ${result.error}`
            );
            if (res.ok) onUpdate?.();
        } catch (e) {
            notify(`Error: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
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
        } catch (e) {
            notify(`Error: ${e.message}`);
        }
    };

    const handleSaveSettings = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/cameras/${camera.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramBotToken: tgToken.trim(), telegramChatId: tgChatId.trim() }),
            });
            notify(res.ok ? 'Configuración guardada' : 'Error al guardar');
            if (res.ok) setShowSettings(false);
        } catch (e) {
            notify(`Error: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setIsLoading(true);
        try {
            await fetch(`/api/cameras/${camera.id}`, { method: 'DELETE' });
            onUpdate?.();
        } catch (e) {
            notify(`Error: ${e.message}`);
            setConfirmDelete(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 flex flex-col">
            {/* Video */}
            <div className={`relative aspect-video bg-black ${camera.motionActive ? 'ring-2 ring-orange-400 ring-inset' : ''}`}>
                <img
                    src={`/api/cameras/${camera.id}/mjpeg`}
                    alt={camera.name}
                    className="w-full h-full object-cover"
                    onError={() => notify('Sin señal — verificá la conexión')}
                />

                {/* Bounding boxes: SVG borders + div labels */}
                {boxes.length > 0 && <>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {boxes.map((box, i) => (
                            <rect
                                key={i}
                                x={`${box.x * 100}%`}
                                y={`${box.y * 100}%`}
                                width={`${box.w * 100}%`}
                                height={`${box.h * 100}%`}
                                fill="none"
                                stroke={boxColor(box.label)}
                                strokeWidth="2"
                                rx="2"
                            />
                        ))}
                    </svg>
                    {boxes.map((box, i) => (
                        <div
                            key={i}
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

                {/* Motion detected badge (not yet recording) */}
                {camera.motionActive && !camera.isRecording && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-orange-500/90 backdrop-blur-sm rounded px-2 py-1">
                        <Activity size={12} className="text-white animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wide">MOVIMIENTO</span>
                    </div>
                )}

                {/* Recording badge */}
                {camera.isRecording && (
                    <div className={`absolute top-3 right-3 flex items-center gap-1.5 backdrop-blur-sm rounded px-2 py-1 ${
                        camera.continuousRecord ? 'bg-amber-600/90' : camera.motionDetect ? 'bg-purple-600/90' : 'bg-red-600/90'
                    }`}>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wide">
                            {camera.continuousRecord ? 'AUTO' : camera.motionDetect ? 'MOV' : 'REC'}
                        </span>
                    </div>
                )}

                {/* Bottom overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2.5">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-white font-medium text-sm leading-tight">{camera.name}</p>
                            <p className="text-slate-300 text-xs">{camera.ip}</p>
                        </div>
                        {camera.isOnline === false ? (
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                <span className="text-red-400 text-xs font-medium">SIN SEÑAL</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                <span className="text-slate-300 text-xs">EN VIVO</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div className="px-3 py-2.5 flex items-center gap-2 border-t border-slate-700">
                <button
                    onClick={handleScreenshot}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                    <Camera size={14} />
                    Captura
                </button>

                {camera.continuousRecord ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700/40 border border-amber-600/40 text-amber-300 rounded-lg text-sm font-medium cursor-default">
                        <Video size={14} />
                        Auto
                    </div>
                ) : (
                    <button
                        onClick={handleRecording}
                        disabled={isLoading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                            camera.isRecording
                                ? 'bg-red-600 hover:bg-red-500 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                    >
                        {camera.isRecording ? <Square size={14} /> : <Video size={14} />}
                        {camera.isRecording ? 'Detener' : 'Grabar'}
                    </button>
                )}

                <button
                    onClick={handleMotion}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        camera.motionDetect
                            ? 'bg-purple-600 hover:bg-purple-500 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                    title={camera.motionDetect ? 'Desactivar detección de movimiento' : 'Activar detección de movimiento'}
                >
                    <Activity size={14} />
                    Mov.
                </button>

                <button
                    onClick={() => setShowSettings(s => !s)}
                    className={`p-1.5 transition-colors ${showSettings ? 'text-blue-400' : 'text-slate-600 hover:text-slate-300'}`}
                    title="Configuración de notificaciones"
                >
                    <Settings size={15} />
                </button>

                <div className="flex-1" />

                {confirmDelete ? (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleDelete}
                            disabled={isLoading}
                            className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
                        >
                            No
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleDelete}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                        title="Eliminar cámara"
                    >
                        <Trash2 size={15} />
                    </button>
                )}
            </div>

            {/* Telegram settings panel */}
            {showSettings && (
                <div className="px-3 py-3 bg-slate-900 border-t border-slate-700 space-y-2">
                    <p className="text-xs text-slate-400 font-medium">Notificaciones Telegram</p>
                    <input
                        type="text"
                        placeholder="Bot Token (ej: 123456:ABC-DEF...)"
                        value={tgToken}
                        onChange={e => setTgToken(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                        type="text"
                        placeholder="Chat ID (ej: -1001234567890)"
                        value={tgChatId}
                        onChange={e => setTgChatId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveSettings}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                            Guardar
                        </button>
                        {(tgToken || tgChatId) && (
                            <button
                                onClick={async () => { setTgToken(''); setTgChatId(''); await fetch(`/api/cameras/${camera.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramBotToken: '', telegramChatId: '' }) }); notify('Telegram desactivado'); setShowSettings(false); }}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
                            >
                                Desactivar
                            </button>
                        )}
                        <a
                            href="https://t.me/BotFather"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto"
                        >
                            Crear bot →
                        </a>
                    </div>
                </div>
            )}

            {/* Status bar */}
            {lastAction && (
                <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-700">
                    <p className="text-slate-400 text-xs">{lastAction}</p>
                </div>
            )}
        </div>
    );
}
