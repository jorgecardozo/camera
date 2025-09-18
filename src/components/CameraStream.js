import { useState, useRef, useEffect } from 'react';
import { Camera, Video, Square, RotateCcw } from 'lucide-react';

export default function CameraStream({ camera, onUpdate }) {
    const [isLoading, setIsLoading] = useState(false);
    const [lastAction, setLastAction] = useState('');
    const [streamUrl, setStreamUrl] = useState('');
    const videoRef = useRef(null);

    // Generar URL del stream HTTP
    useEffect(() => {
        if (camera && camera.id) {
            setStreamUrl(`/api/cameras/${camera.id}/mjpeg`);
        }
    }, [camera]);

    const handleScreenshot = async () => {
        setIsLoading(true);
        setLastAction('Tomando captura...');

        try {
            const response = await fetch(`/api/cameras/${camera.id}/screenshot`, {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
                setLastAction(`Captura guardada: ${result.filename}`);
                onUpdate && onUpdate();
            } else {
                setLastAction(`Error: ${result.error}`);
            }
        } catch (error) {
            setLastAction(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setLastAction(''), 3000);
        }
    };

    const handleRecording = async () => {
        setIsLoading(true);

        try {
            const method = camera.isRecording ? 'DELETE' : 'POST';
            const action = camera.isRecording ? 'Deteniendo...' : 'Iniciando grabación...';
            setLastAction(action);

            const response = await fetch(`/api/cameras/${camera.id}/recording`, {
                method
            });

            const result = await response.json();

            if (response.ok) {
                setLastAction(camera.isRecording ? 'Grabación detenida' : 'Grabación iniciada');
                onUpdate && onUpdate();
            } else {
                setLastAction(`Error: ${result.error}`);
            }
        } catch (error) {
            setLastAction(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setLastAction(''), 3000);
        }
    };

    const handlePTZ = async (action, preset = null) => {
        try {
            const body = { action };
            if (preset !== null) body.preset = preset;

            const response = await fetch(`/api/cameras/${camera.id}/ptz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                setLastAction(`Error PTZ: ${error.error}`);
                setTimeout(() => setLastAction(''), 3000);
            }
        } catch (error) {
            setLastAction(`Error PTZ: ${error.message}`);
            setTimeout(() => setLastAction(''), 3000);
        }
    };

    return (
        <div className="border rounded-lg p-4 bg-white shadow-lg">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{camera.name}</h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{camera.ip}</span>
                    <div className={`w-3 h-3 rounded-full ${camera.isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`}></div>
                </div>
            </div>

            {/* Video Stream */}
            <div className="mb-4">
                <video
                    ref={videoRef}
                    className="w-full h-64 bg-black rounded object-cover"
                    controls
                    autoPlay
                    muted
                    src={streamUrl}
                    onError={(e) => {
                        console.error('Error cargando stream:', e);
                        setLastAction('Error al cargar el stream. Probando conexión MJPEG...');
                        // Fallback a MJPEG
                        e.target.src = `http://${camera.ip}/mjpeg/1`;
                    }}
                    onLoadStart={() => setLastAction('Conectando...')}
                    onCanPlay={() => setLastAction('Stream conectado')}
                >
                    Tu navegador no soporta video HTML5.
                </video>

                {/* Fallback: Imagen MJPEG */}
                <div className="mt-2 text-center">
                    <p className="text-sm text-gray-600 mb-2">
                        Si el video no carga, prueba el stream MJPEG:
                    </p>
                    <img
                        src={`http://${camera.ip}/mjpeg/1`}
                        alt="MJPEG Stream"
                        className="max-w-full h-32 mx-auto border rounded"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            setLastAction('Stream no disponible');
                        }}
                    />
                </div>
            </div>

            {/* Controles principales */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={handleScreenshot}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                    <Camera size={16} />
                    Captura
                </button>

                <button
                    onClick={handleRecording}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded text-white ${camera.isRecording
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-500 hover:bg-green-600'
                        } disabled:opacity-50`}
                >
                    {camera.isRecording ? <Square size={16} /> : <Video size={16} />}
                    {camera.isRecording ? 'Detener' : 'Grabar'}
                </button>

                <button
                    onClick={() => handlePTZ('stop')}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                    <RotateCcw size={16} />
                    Stop
                </button>
            </div>

            {/* Controles PTZ */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto mb-4">
                <div></div>
                <button
                    onClick={() => handlePTZ('up')}
                    className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded"
                >
                    ⬆️
                </button>
                <div></div>

                <button
                    onClick={() => handlePTZ('left')}
                    className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded"
                >
                    ⬅️
                </button>
                <button
                    onClick={() => handlePTZ('stop')}
                    className="py-2 px-4 bg-gray-300 hover:bg-gray-400 rounded font-bold"
                >
                    ⏹️
                </button>
                <button
                    onClick={() => handlePTZ('right')}
                    className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded"
                >
                    ➡️
                </button>

                <div></div>
                <button
                    onClick={() => handlePTZ('down')}
                    className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded"
                >
                    ⬇️
                </button>
                <div></div>
            </div>

            {/* Controles de Zoom */}
            <div className="flex gap-2 justify-center mb-4">
                <button
                    onClick={() => handlePTZ('zoomin')}
                    className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                    🔍+ Zoom In
                </button>
                <button
                    onClick={() => handlePTZ('zoomout')}
                    className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                    🔍- Zoom Out
                </button>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(preset => (
                    <button
                        key={preset}
                        onClick={() => handlePTZ('preset', preset)}
                        className="py-2 px-3 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm"
                    >
                        Preset {preset}
                    </button>
                ))}
            </div>

            {/* Información de conexión */}
            <div className="mt-4 p-2 bg-gray-50 rounded text-xs">
                <div>RTSP: {camera.rtspUrl}</div>
                <div>HTTP Stream: {streamUrl}</div>
            </div>

            {/* Status */}
            {lastAction && (
                <div className="mt-4 p-2 bg-gray-100 rounded text-sm text-center">
                    {lastAction}
                </div>
            )}
        </div>
    )
}