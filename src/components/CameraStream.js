import { useState } from 'react';
import { Camera, Video, Square, Trash2 } from 'lucide-react';

export default function CameraStream({ camera, onUpdate }) {
    const [isLoading, setIsLoading] = useState(false);
    const [lastAction, setLastAction] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

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
            <div className="relative aspect-video bg-black">
                <img
                    src={`/api/cameras/${camera.id}/mjpeg`}
                    alt={camera.name}
                    className="w-full h-full object-cover"
                    onError={() => notify('Sin señal — verificá la conexión')}
                />

                {/* Recording badge */}
                {camera.isRecording && (
                    <div className={`absolute top-3 right-3 flex items-center gap-1.5 backdrop-blur-sm rounded px-2 py-1 ${
                        camera.continuousRecord ? 'bg-amber-600/90' : 'bg-red-600/90'
                    }`}>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wide">
                            {camera.continuousRecord ? 'AUTO' : 'REC'}
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
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-green-400 rounded-full" />
                            <span className="text-slate-300 text-xs">EN VIVO</span>
                        </div>
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

            {/* Status bar */}
            {lastAction && (
                <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-700">
                    <p className="text-slate-400 text-xs">{lastAction}</p>
                </div>
            )}

        </div>
    );
}
