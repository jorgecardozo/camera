import { useState, useEffect, useRef } from 'react';
import { Plus, Wifi, Settings, Search, Zap, X, CheckCircle, AlertTriangle } from 'lucide-react';
import OnboardingBanner from './OnboardingBanner.js';

// Generate a short camera ID from an IP address last octet.
function idFromIp(ip) {
    const last = ip.split('.').pop();
    return `cam${last}`;
}

function getRtspPathFromUrl(rtspUrl) {
    if (!rtspUrl) return '/live';
    try {
        return new URL(rtspUrl.replace('rtsp://', 'http://')).pathname;
    } catch {
        return '/live';
    }
}

/** @param {{ onCameraAdded: () => void, cameras: { id: string, ip: string, name: string }[], autoScan?: boolean }} props */
export default function CameraSetup({ onCameraAdded, cameras = [], autoScan = false }) {
    const registeredIps = new Set(cameras.map(c => c.ip));
    const [showForm, setShowForm]     = useState(false);
    const [formData, setFormData]     = useState({
        id: '', name: '', ip: '', port: '554', httpPort: '80',
        username: '', password: '', rtspPath: '/live', continuousRecord: false,
    });
    const [isLoading, setIsLoading]   = useState(false);
    const [message, setMessage]       = useState('');
    const [scanning, setScanning]     = useState(false);
    const [scanResults, setScanResults] = useState([]);
    const [scanError, setScanError]   = useState('');
    // IP of the scan result that has the quick-connect form open
    const [expandedIp, setExpandedIp] = useState(null);
    const [quickForm, setQuickForm]   = useState({});
    const [addedIps, setAddedIps]     = useState(new Set());
    const [addingAll, setAddingAll]   = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    // ── Full form ────────────────────────────────────────────────────────────

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');
        try {
            const res = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await res.json();
            if (res.ok) {
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
        } catch (err) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    // ── Quick-connect (inline form for RTSP scan results) ────────────────────

    const openQuickForm = (result) => {
        setExpandedIp(result.ip);
        setQuickForm({
            name:     `Cámara ${result.ip.split('.').pop()}`,
            username: result.username || '',
            password: result.password || '',
            rtspPath: result.rtspUrl ? getRtspPathFromUrl(result.rtspUrl) : '/live',
        });
    };

    const handleQuickChange = (e) => {
        setQuickForm({ ...quickForm, [e.target.name]: e.target.value });
    };

    const handleQuickSubmit = async (result) => {
        setIsLoading(true);
        try {
            const payload = {
                id:       idFromIp(result.ip),
                name:     quickForm.name,
                ip:       result.ip,
                port:     result.rtspPort || 554,
                httpPort: result.httpPort || 80,
                username: quickForm.username,
                password: quickForm.password,
                rtspPath: quickForm.rtspPath,
                continuousRecord: false,
            };
            const res = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok) {
                setAddedIps(prev => new Set([...prev, result.ip]));
                setExpandedIp(null);
                onCameraAdded?.();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Quick-add for verified cameras (no form required) ────────────────────

    const quickAdd = async (cam) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id:       idFromIp(cam.ip),
                    name:     `Cámara ${cam.ip.split('.').pop()}`,
                    ip:       cam.ip,
                    port:     cam.rtspPort || 554,
                    httpPort: cam.httpPort || 80,
                    username: cam.username || '',
                    password: cam.password || '',
                    rtspPath: getRtspPathFromUrl(cam.rtspUrl),
                    continuousRecord: false,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setAddedIps(prev => new Set([...prev, cam.ip]));
                onCameraAdded?.();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Add all verified cameras at once ─────────────────────────────────────

    const addAllVerified = async () => {
        setAddingAll(true);
        const verified = scanResults.filter(r => r.status === 'verified' && !addedIps.has(r.ip) && !registeredIps.has(r.ip));
        for (const cam of verified) {
            try {
                const res = await fetch('/api/cameras', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id:       idFromIp(cam.ip),
                        name:     `Cámara ${cam.ip.split('.').pop()}`,
                        ip:       cam.ip,
                        port:     cam.rtspPort || 554,
                        httpPort: cam.httpPort || 80,
                        username: cam.username || '',
                        password: cam.password || '',
                        rtspPath: getRtspPathFromUrl(cam.rtspUrl),
                        continuousRecord: false,
                    }),
                });
                if (res.ok) {
                    setAddedIps(prev => new Set([...prev, cam.ip]));
                }
            } catch (_) {}
        }
        onCameraAdded?.();
        setAddingAll(false);
    };

    // ── Scan ─────────────────────────────────────────────────────────────────

    const handleScan = async () => {
        setScanning(true);
        setScanResults([]);
        setScanError('');
        setExpandedIp(null);
        setAddedIps(new Set());
        try {
            const res    = await fetch('/api/cameras/scan');
            const result = await res.json();
            if (res.ok) {
                setScanResults(result.found);
                if (result.found.length === 0) {
                    const subnets = result.subnets?.join(', ') || result.subnet;
                    setScanError(`No se encontraron dispositivos en ${subnets}.x`);
                }
            } else {
                setScanError('Error al escanear la red');
            }
        } catch (err) {
            setScanError(`Error: ${err.message}`);
        } finally {
            setScanning(false);
        }
    };

    // ── Auto-scan on first mount when requested ───────────────────────────────

    const autoScanFiredRef = useRef(false);
    useEffect(() => {
        if (autoScan && !autoScanFiredRef.current) {
            autoScanFiredRef.current = true;
            handleScan();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const applyScannedIp = (result) => {
        setFormData({
            ...formData,
            ip:       result.ip,
            port:     result.rtspPort ? String(result.rtspPort) : '554',
            httpPort: result.httpPort ? String(result.httpPort) : '80',
        });
        setShowForm(true);
        setExpandedIp(null);
    };

    const inputCls  = "w-full bg-slate-900 border border-slate-600/80 text-slate-100 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors placeholder:text-slate-500";
    const labelCls  = "text-slate-300 text-sm font-medium mb-1.5 block";
    const qInputCls = "w-full bg-slate-800 border border-slate-600/80 text-slate-100 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500";

    const rtspResults    = scanResults.filter(r => r.rtspPort);
    const nonRtspResults = scanResults.filter(r => !r.rtspPort);

    const verified   = rtspResults.filter(r => r.status === 'verified' && !addedIps.has(r.ip) && !registeredIps.has(r.ip));
    const canAddAll  = verified.length > 0 && !addingAll;

    const verifiedUnregistered = scanResults.filter(
        r => r.status === 'verified' && !addedIps.has(r.ip) && !registeredIps.has(r.ip)
    );
    const showBanner = autoScan && !bannerDismissed && !scanning && verifiedUnregistered.length > 0;

    return (
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-6">
            {showBanner && (
                <OnboardingBanner
                    verifiedCameras={verifiedUnregistered}
                    onAddAll={addAllVerified}
                    onDismiss={() => setBannerDismissed(true)}
                    isAdding={addingAll}
                />
            )}
            <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-400" />
                    Cámaras
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleScan}
                        disabled={scanning}
                        className="flex items-center gap-2 h-10 px-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-xl text-sm transition-colors disabled:opacity-40"
                    >
                        <Search className="w-4 h-4" />
                        {scanning ? 'Escaneando...' : 'Escanear'}
                    </button>
                    <button
                        onClick={() => { setShowForm(!showForm); setExpandedIp(null); }}
                        className="flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-400 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Agregar
                    </button>
                </div>
            </div>

            {/* Scan results */}
            {(scanResults.length > 0 || scanError) && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Search className="w-4 h-4" />
                            Dispositivos Encontrados
                        </h3>
                        {canAddAll && (
                            <button
                                onClick={addAllVerified}
                                disabled={addingAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                            >
                                <CheckCircle className="w-3.5 h-3.5" />
                                {addingAll ? 'Agregando...' : `Agregar todas (${verified.length})`}
                            </button>
                        )}
                    </div>

                    {scanError && (
                        <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300 text-sm">
                            {scanError}
                        </div>
                    )}

                    {/* RTSP devices — quick connect */}
                    {rtspResults.length > 0 && (
                        <div className="space-y-2 mb-3">
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                                Cámaras detectadas (RTSP)
                            </p>
                            {rtspResults.map((result) => {
                                const added      = addedIps.has(result.ip);
                                const registered = registeredIps.has(result.ip) || result.status === 'already_registered';
                                const done       = added || registered;
                                const expanded   = expandedIp === result.ip;
                                const isVerified = result.status === 'verified';
                                const isUnknown  = result.status === 'unknown';

                                return (
                                    <div
                                        key={result.ip}
                                        className={`border rounded-xl overflow-hidden transition-colors ${
                                            done
                                                ? 'bg-green-900/20 border-green-700/50'
                                                : isVerified
                                                    ? 'bg-slate-900 border-green-700/40'
                                                    : 'bg-slate-900 border-slate-600'
                                        }`}
                                    >
                                        {/* Row */}
                                        <div className="flex items-center justify-between px-3 py-2.5">
                                            <div>
                                                <span className="font-mono font-medium text-slate-100">{result.ip}</span>
                                                <div className="text-xs mt-0.5 flex items-center gap-2">
                                                    <span className="text-blue-400 font-medium">RTSP :{result.rtspPort}</span>
                                                    {result.httpPort && <span className="text-slate-500">HTTP :{result.httpPort}</span>}
                                                    {isVerified && (
                                                        <span className="flex items-center gap-1 text-green-400 font-medium">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Detectada — {result.brand}
                                                        </span>
                                                    )}
                                                    {isUnknown && (
                                                        <span className="flex items-center gap-1 text-amber-400">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Credenciales no detectadas
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {done ? (
                                                <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                                    {registered && !added
                                                        ? cameras.find(c => c.ip === result.ip)?.name || 'Registrada'
                                                        : 'Agregada'}
                                                </span>
                                            ) : isVerified ? (
                                                <button
                                                    onClick={() => quickAdd(result)}
                                                    disabled={isLoading}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                    Agregar
                                                </button>
                                            ) : expanded ? (
                                                <button
                                                    onClick={() => setExpandedIp(null)}
                                                    className="text-slate-400 hover:text-slate-200 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openQuickForm(result)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                    Agregar
                                                </button>
                                            )}
                                        </div>

                                        {/* Inline quick-connect form (for unknown cameras) */}
                                        {expanded && (
                                            <div className="border-t border-slate-700 px-3 py-3 bg-slate-950/40">
                                                <div className="grid grid-cols-2 gap-2 mb-2">
                                                    <div className="col-span-2">
                                                        <label className="text-slate-400 text-xs mb-1 block">Nombre</label>
                                                        <input
                                                            type="text"
                                                            name="name"
                                                            value={quickForm.name}
                                                            onChange={handleQuickChange}
                                                            className={qInputCls}
                                                            placeholder="Cámara Entrada"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-slate-400 text-xs mb-1 block">Usuario</label>
                                                        <input
                                                            type="text"
                                                            name="username"
                                                            value={quickForm.username}
                                                            onChange={handleQuickChange}
                                                            className={qInputCls}
                                                            placeholder="admin"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-slate-400 text-xs mb-1 block">Contraseña</label>
                                                        <input
                                                            type="password"
                                                            name="password"
                                                            value={quickForm.password}
                                                            onChange={handleQuickChange}
                                                            className={qInputCls}
                                                            placeholder="••••••"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-slate-400 text-xs mb-1 block">Ruta RTSP</label>
                                                        <input
                                                            type="text"
                                                            name="rtspPath"
                                                            value={quickForm.rtspPath}
                                                            onChange={handleQuickChange}
                                                            className={qInputCls}
                                                            placeholder="/live"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleQuickSubmit(result)}
                                                        disabled={isLoading}
                                                        className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                                                    >
                                                        {isLoading ? 'Conectando...' : 'Conectar'}
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedIp(null)}
                                                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Non-RTSP devices */}
                    {nonRtspResults.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                                Otros dispositivos (sin RTSP)
                            </p>
                            {nonRtspResults.map((result) => {
                                const registered = registeredIps.has(result.ip) || result.status === 'already_registered';
                                return (
                                    <div
                                        key={result.ip}
                                        className={`flex items-center justify-between p-3 border rounded-lg ${
                                            registered
                                                ? 'bg-green-900/20 border-green-700/50'
                                                : 'bg-slate-900 border-slate-700'
                                        }`}
                                    >
                                        <div>
                                            <span className={`font-mono ${registered ? 'text-slate-200' : 'text-slate-400'}`}>{result.ip}</span>
                                            <div className="text-xs text-slate-600 mt-0.5">
                                                {result.httpPort && <span>HTTP :{result.httpPort}</span>}
                                                {result.discoveredVia === 'onvif' && (
                                                    <span className="ml-2 text-blue-500">ONVIF</span>
                                                )}
                                            </div>
                                        </div>
                                        {registered ? (
                                            <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                                {cameras.find(c => c.ip === result.ip)?.name || 'Registrada'}
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => applyScannedIp(result)}
                                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
                                            >
                                                Usar IP
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Full form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-700/60">
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
                                placeholder="(vacío si no requiere)" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Contraseña</label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange}
                                placeholder="(vacío si no requiere)" className={inputCls} />
                        </div>
                    </div>

                    <label className="flex items-center gap-3 p-4 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer hover:border-slate-600 transition-colors">
                        <input
                            type="checkbox"
                            name="continuousRecord"
                            checked={formData.continuousRecord}
                            onChange={handleChange}
                            className="w-4 h-4 accent-blue-500"
                        />
                        <div>
                            <div className="text-slate-200 text-sm font-medium">Grabación continua</div>
                            <div className="text-slate-500 text-xs">Graba 24/7 automáticamente en segmentos de 30 min</div>
                        </div>
                    </label>

                    <div className="flex gap-3">
                        <button type="submit" disabled={isLoading}
                            className="flex-1 sm:flex-none h-11 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
                            {isLoading ? 'Agregando...' : 'Agregar Cámara'}
                        </button>
                        <button type="button" onClick={() => setShowForm(false)}
                            className="flex-1 sm:flex-none h-11 px-6 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-medium transition-colors">
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
