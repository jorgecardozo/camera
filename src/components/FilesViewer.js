import { useState, useEffect } from 'react';
import { Video, Camera, Download, X, RefreshCw, HardDrive } from 'lucide-react';

export default function FilesViewer() {
    const [recordings, setRecordings]   = useState([]);
    const [screenshots, setScreenshots] = useState([]);
    const [diskStatus, setDiskStatus]   = useState(null);
    const [activeTab, setActiveTab]     = useState('recordings');
    const [loading, setLoading]         = useState(false);
    const [lightbox, setLightbox]       = useState(null);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const [recRes, ssRes, diskRes] = await Promise.all([
                fetch('/api/files?type=recordings'),
                fetch('/api/files?type=screenshots'),
                fetch('/api/files?type=disk-status'),
            ]);
            const recData  = await recRes.json();
            const ssData   = await ssRes.json();
            const diskData = diskRes.ok ? await diskRes.json() : null;
            setRecordings(recData.recordings   || []);
            setScreenshots(ssData.screenshots  || []);
            setDiskStatus(diskData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
        const i = setInterval(fetchFiles, 30000);
        return () => clearInterval(i);
    }, []);

    const fmt = {
        size: (b) => {
            if (!b) return '0 B';
            const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
        },
        date: (d) => new Date(d).toLocaleString('es-AR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }),
    };

    return (
        <div className="space-y-4">
            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                    onClick={() => setLightbox(null)}
                >
                    <button className="absolute top-4 right-4 text-white/60 hover:text-white">
                        <X className="w-8 h-8" />
                    </button>
                    <img
                        src={lightbox}
                        alt="Captura"
                        className="max-w-full max-h-full rounded-lg"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Disk space panel */}
            {diskStatus && <DiskPanel disk={diskStatus} />}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('recordings')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'recordings'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Video className="w-4 h-4" />
                        Grabaciones ({recordings.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('screenshots')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'screenshots'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Camera className="w-4 h-4" />
                        Capturas ({screenshots.length})
                    </button>
                </div>

                <button
                    onClick={fetchFiles}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Content */}
            {loading && recordings.length === 0 && screenshots.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : activeTab === 'recordings' ? (
                recordings.length === 0 ? (
                    <EmptyState icon={Video} text="No hay grabaciones" />
                ) : (
                    <div className="space-y-3">
                        {recordings.map((file, i) => (
                            <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                <video
                                    className="w-full max-h-72 bg-black"
                                    controls
                                    preload="metadata"
                                    src={file.path}
                                />
                                <div className="px-4 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-slate-200 text-sm font-medium truncate max-w-xs">{file.filename}</p>
                                        <p className="text-slate-500 text-xs mt-0.5">{fmt.date(file.created)} · {fmt.size(file.size)}</p>
                                    </div>
                                    <a
                                        href={file.path}
                                        download
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                        Descargar
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                screenshots.length === 0 ? (
                    <EmptyState icon={Camera} text="No hay capturas" />
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {screenshots.map((file, i) => (
                            <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden group">
                                <div
                                    className="aspect-video bg-black cursor-pointer relative"
                                    onClick={() => setLightbox(file.path)}
                                >
                                    <img
                                        src={file.path}
                                        alt="Captura"
                                        className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                        <span className="text-white text-xs bg-black/60 px-2 py-1 rounded">Ver</span>
                                    </div>
                                </div>
                                <div className="px-2.5 py-2 flex items-center justify-between">
                                    <p className="text-slate-500 text-xs">{fmt.date(file.created)}</p>
                                    <a href={file.path} download className="text-slate-500 hover:text-slate-300 transition-colors">
                                        <Download className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

function DiskPanel({ disk }) {
    const used      = disk.usedGB;
    const total     = disk.totalGB;
    const available = disk.availableGB;
    const recGB     = disk.recordingsGB;

    // Percentage of total disk used overall
    const usedPct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    // Percentage used by recordings
    const recPct  = total > 0 ? Math.min((recGB / total) * 100, 100) : 0;

    const freeColor = available < total * 0.1
        ? 'text-red-400'
        : available < total * 0.25
            ? 'text-amber-400'
            : 'text-green-400';

    // How many days can we record with this setup?
    // Rough estimate: typical WiFi cam RTSP copy ~1 GB/hour at 1080p
    // Conservative: 2 GB/hour for high-bitrate cameras
    const estimatedDaysPerCam = recGB > 0 && disk.maxAgeHours > 0
        ? null  // already limited by retention policy
        : null;

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">Almacenamiento</span>
            </div>

            {/* Main bar */}
            <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                        Grabaciones: <span className="text-slate-200 font-medium">{recGB.toFixed(2)} GB</span>
                        {disk.maxGB && (
                            <span className="text-slate-500"> / límite {disk.maxGB} GB</span>
                        )}
                    </span>
                    <span className={`font-medium ${freeColor}`}>
                        {available.toFixed(1)} GB disponibles
                    </span>
                </div>

                {/* Bar: grey = free, blue = recordings, dark = other usage */}
                <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden flex">
                    <div
                        className="h-full bg-slate-600 transition-all"
                        style={{ width: `${Math.max(usedPct - recPct, 0)}%` }}
                        title="Otros archivos del sistema"
                    />
                    <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${recPct}%` }}
                        title="Grabaciones de cámaras"
                    />
                </div>

                <div className="flex justify-between text-xs text-slate-500">
                    <span>Sistema: {(used - recGB).toFixed(1)} GB</span>
                    <span>Total disco: {total.toFixed(0)} GB</span>
                </div>
            </div>

            {/* Storage estimate for vacation */}
            <StorageEstimate available={available} maxGB={disk.maxGB} maxAgeHours={disk.maxAgeHours} />
        </div>
    );
}

function StorageEstimate({ available, maxGB, maxAgeHours }) {
    // Typical RTSP H.264 stream copy: ~1–2 GB/hour per camera at 1080p
    // We use 1.5 GB/hour as a middle estimate
    const GB_PER_HOUR_PER_CAM = 1.5;
    const effectiveGB = maxGB > 0 ? Math.min(available, maxGB) : available;

    const camOptions = [1, 2, 3, 4];

    return (
        <div className="border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-400 mb-2">
                Estimación de días grabables con espacio disponible
                <span className="text-slate-600"> (≈1.5 GB/h por cámara a 1080p)</span>:
            </p>
            <div className="grid grid-cols-4 gap-2">
                {camOptions.map(n => {
                    const days = effectiveGB / (GB_PER_HOUR_PER_CAM * n * 24);
                    const cappedDays = maxAgeHours > 0 ? Math.min(days, maxAgeHours / 24) : days;
                    const color = cappedDays >= 14
                        ? 'text-green-400'
                        : cappedDays >= 7
                            ? 'text-amber-400'
                            : 'text-red-400';
                    return (
                        <div key={n} className="bg-slate-900 rounded-lg p-2 text-center">
                            <div className={`text-lg font-bold ${color}`}>
                                {cappedDays >= 1 ? Math.floor(cappedDays) : '<1'}
                            </div>
                            <div className="text-slate-500 text-xs">
                                {n} cám{n > 1 ? 's' : ''}
                            </div>
                            {maxAgeHours > 0 && days > maxAgeHours / 24 && (
                                <div className="text-slate-600 text-xs">límite: {Math.floor(maxAgeHours / 24)}d</div>
                            )}
                        </div>
                    );
                })}
            </div>
            {maxAgeHours > 0 && (
                <p className="text-xs text-slate-600 mt-2">
                    Retención configurada a {maxAgeHours}h ({Math.floor(maxAgeHours / 24)} días). Ajustá MAX_RECORDING_AGE_HOURS en .env.local para vacaciones.
                </p>
            )}
        </div>
    );
}

function EmptyState({ icon: Icon, text }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center">
                <Icon className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm">{text}</p>
        </div>
    );
}
