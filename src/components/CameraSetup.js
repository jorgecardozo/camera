import { useState } from 'react';
import { Plus, Wifi, Settings, Search } from 'lucide-react';

export default function CameraSetup({ onCameraAdded }) {
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        ip: '',
        port: '554',
        httpPort: '80',
        username: '',
        password: '',
        rtspPath: '/live',
        continuousRecord: false,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState([]);
    const [scanError, setScanError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                setMessage('Cámara agregada exitosamente');
                setFormData({
                    id: '', name: '', ip: '', port: '554', httpPort: '80',
                    username: '', password: '', rtspPath: '/live', continuousRecord: false,
                });
                setShowForm(false);
                onCameraAdded?.();
            } else {
                setMessage(`Error: ${result.error}`);
            }
        } catch (error) {
            setMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    const presetCameras = [
        { id: 'cam1', name: 'Cámara Entrada',   ip: '192.168.1.101', username: 'admin', password: '' },
        { id: 'cam2', name: 'Cámara Sala',      ip: '192.168.1.102', username: 'admin', password: '' },
        { id: 'cam3', name: 'Cámara Cocina',    ip: '192.168.1.103', username: 'admin', password: '' },
        { id: 'cam4', name: 'Cámara Exterior',  ip: '192.168.1.104', username: 'admin', password: '' },
    ];

    const addPresetCamera = (preset) => {
        setFormData({ ...formData, ...preset, port: '554', httpPort: '80', rtspPath: '/live' });
        setShowForm(true);
    };

    const handleScan = async () => {
        setScanning(true);
        setScanResults([]);
        setScanError('');
        try {
            const response = await fetch('/api/cameras/scan');
            const result = await response.json();
            if (response.ok) {
                setScanResults(result.found);
                if (result.found.length === 0) {
                    const subnets = result.subnets?.join(', ') || result.subnet;
                    setScanError(`No se encontraron dispositivos en ${subnets}.x`);
                }
            } else {
                setScanError('Error al escanear la red');
            }
        } catch (error) {
            setScanError(`Error: ${error.message}`);
        } finally {
            setScanning(false);
        }
    };

    const applyScannedIp = (result) => {
        setFormData({
            ...formData,
            ip: result.ip,
            port: result.rtspPort ? String(result.rtspPort) : '554',
            httpPort: result.httpPort ? String(result.httpPort) : '80',
        });
        setShowForm(true);
    };

    const inputCls = "w-full bg-slate-900 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500";
    const labelCls = "text-slate-300 text-sm font-medium mb-1 block";

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-400" />
                    Configuración de Cámaras
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleScan}
                        disabled={scanning}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors disabled:opacity-40"
                    >
                        <Search className="w-4 h-4" />
                        {scanning ? 'Escaneando...' : 'Escanear Red'}
                    </button>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Agregar Cámara
                    </button>
                </div>
            </div>

            {/* Quick presets */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <Wifi className="w-4 h-4" />
                    Configuraciones Rápidas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {presetCameras.map((preset) => (
                        <button
                            key={preset.id}
                            onClick={() => addPresetCamera(preset)}
                            className="p-3 bg-slate-900 border border-slate-600 rounded-lg hover:border-slate-500 hover:bg-slate-900/70 text-left transition-colors"
                        >
                            <div className="font-medium text-slate-200 text-sm">{preset.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{preset.ip} — completar credenciales</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Scan results */}
            {(scanResults.length > 0 || scanError) && (
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Dispositivos Encontrados
                    </h3>
                    {scanError && (
                        <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300 text-sm">
                            {scanError}
                        </div>
                    )}
                    {scanResults.length > 0 && (
                        <div className="space-y-2">
                            {scanResults.map((result) => (
                                <div
                                    key={result.ip}
                                    className="flex items-center justify-between p-3 bg-slate-900 border border-slate-600 rounded-lg"
                                >
                                    <div>
                                        <span className="font-mono font-medium text-slate-100">{result.ip}</span>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {result.rtspPort && <span className="mr-3">RTSP :{result.rtspPort}</span>}
                                            {result.httpPort && <span>HTTP :{result.httpPort}</span>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => applyScannedIp(result)}
                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition-colors"
                                    >
                                        Usar esta IP
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>ID de Cámara</label>
                            <input type="text" name="id" value={formData.id} onChange={handleChange}
                                placeholder="ej: cam1" required className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Nombre</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange}
                                placeholder="ej: Cámara Entrada" required className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Dirección IP</label>
                            <input type="text" name="ip" value={formData.ip} onChange={handleChange}
                                placeholder="192.168.1.100" required className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Puerto RTSP</label>
                            <input type="number" name="port" value={formData.port} onChange={handleChange}
                                placeholder="554" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Puerto HTTP</label>
                            <input type="number" name="httpPort" value={formData.httpPort} onChange={handleChange}
                                placeholder="80" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Ruta RTSP</label>
                            <input type="text" name="rtspPath" value={formData.rtspPath} onChange={handleChange}
                                placeholder="/live" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Usuario</label>
                            <input type="text" name="username" value={formData.username} onChange={handleChange}
                                placeholder="admin" required className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Contraseña</label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange}
                                placeholder="contraseña" required className={inputCls} />
                        </div>
                    </div>

                    {/* Continuous recording toggle */}
                    <label className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors">
                        <input
                            type="checkbox"
                            name="continuousRecord"
                            checked={formData.continuousRecord}
                            onChange={handleChange}
                            className="w-4 h-4 accent-blue-500"
                        />
                        <div>
                            <div className="text-slate-200 text-sm font-medium">Grabación continua</div>
                            <div className="text-slate-500 text-xs">Graba 24/7 automáticamente, creando segmentos de 30 min</div>
                        </div>
                    </label>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                        >
                            {isLoading ? 'Agregando...' : 'Agregar Cámara'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {message && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                    message.includes('Error')
                        ? 'bg-red-900/30 border border-red-700/50 text-red-300'
                        : 'bg-green-900/30 border border-green-700/50 text-green-300'
                }`}>
                    {message}
                </div>
            )}
        </div>
    );
}
