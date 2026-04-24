import { useState, useEffect } from 'react';
import { Video, Camera, Download, X, RefreshCw, HardDrive } from 'lucide-react';

function extractCameraId(filename) {
    let m = filename.match(/^cam_([^_]+)_/);
    if (m) return m[1];
    m = filename.match(/^screenshot_camera_([^_]+)_/);
    if (m) return m[1];
    return null;
}

/** @param {{ cameras: { id: string, name: string }[] }} props */
export default function FilesViewer({ cameras = [] }) {
    const [recordings, setRecordings]   = useState([]);
    const [screenshots, setScreenshots] = useState([]);
    const [diskStatus, setDiskStatus]   = useState(null);
    const [activeTab, setActiveTab]     = useState('recordings');
    const [activeCam, setActiveCam]     = useState('all');
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
            setRecordings((await recRes.json()).recordings || []);
            setScreenshots((await ssRes.json()).screenshots || []);
            setDiskStatus(diskRes.ok ? await diskRes.json() : null);
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

    const camName = (id) => cameras.find(c => c.id === id)?.name ?? id;

    // Camera IDs that actually appear in files (sorted by id)
    const camIdsInFiles = [...new Set([
        ...recordings.map(f => extractCameraId(f.filename)),
        ...screenshots.map(f => extractCameraId(f.filename)),
    ])].filter(Boolean).sort();

    const filteredRec = activeCam === 'all'
        ? recordings
        : recordings.filter(f => extractCameraId(f.filename) === activeCam);
    const filteredSS = activeCam === 'all'
        ? screenshots
        : screenshots.filter(f => extractCameraId(f.filename) === activeCam);

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

            {diskStatus && <DiskPanel disk={diskStatus} />}

            {/* Camera filter chips */}
            {camIdsInFiles.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    <CamChip active={activeCam === 'all'} onClick={() => setActiveCam('all')}>
                        Todas
                    </CamChip>
                    {camIdsInFiles.map(id => (
                        <CamChip key={id} active={activeCam === id} onClick={() => setActiveCam(id)}>
                            {camName(id)}
                        </CamChip>
                    ))}
                </div>
            )}

            {/* Tabs + refresh */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                    <TabBtn
                        active={activeTab === 'recordings'}
                        onClick={() => setActiveTab('recordings')}
                        icon={Video}
                    >
                        Grabaciones ({filteredRec.length})
                    </TabBtn>
                    <TabBtn
                        active={activeTab === 'screenshots'}
                        onClick={() => setActiveTab('screenshots')}
                        icon={Camera}
                    >
                        Capturas ({filteredSS.length})
                    </TabBtn>
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
            {loading && !recordings.length && !screenshots.length ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : activeTab === 'recordings' ? (
                filteredRec.length === 0
                    ? <EmptyState icon={Video} text="No hay grabaciones" />
                    : <RecordingList files={filteredRec} fmt={fmt} camName={camName} showCam={activeCam === 'all'} />
            ) : (
                filteredSS.length === 0
                    ? <EmptyState icon={Camera} text="No hay capturas" />
                    : <ScreenshotGrid files={filteredSS} fmt={fmt} camName={camName} showCam={activeCam === 'all'} onOpen={setLightbox} />
            )}
        </div>
    );
}

function CamChip({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
        >
            {children}
        </button>
    );
}

function TabBtn({ active, onClick, icon: Icon, children }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
        >
            <Icon className="w-4 h-4" />
            {children}
        </button>
    );
}

function RecordingList({ files, fmt, camName, showCam }) {
    return (
        <div className="space-y-3">
            {files.map((file, i) => {
                const camId = extractCameraId(file.filename);
                return (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        <video
                            className="w-full max-h-64 bg-black"
                            controls
                            preload="metadata"
                            src={`/api/recordings/${file.filename}`}
                        />
                        <div className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                                {showCam && camId && (
                                    <span className="text-xs font-semibold text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded-full shrink-0">
                                        {camName(camId)}
                                    </span>
                                )}
                                <span className="text-slate-400 text-xs">
                                    {fmt.date(file.created)} · {fmt.size(file.size)}
                                </span>
                                <span className="text-slate-600 text-xs truncate hidden sm:block">
                                    {file.filename}
                                </span>
                            </div>
                            <a
                                href={`/api/recordings/${file.filename}?download=1`}
                                download
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Descargar
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ScreenshotGrid({ files, fmt, camName, showCam, onOpen }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((file, i) => {
                const camId = extractCameraId(file.filename);
                return (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden group">
                        <div
                            className="aspect-video bg-black cursor-pointer relative"
                            onClick={() => onOpen(`/api/screenshots/${file.filename}`)}
                        >
                            <img
                                src={`/api/screenshots/${file.filename}`}
                                alt="Captura"
                                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                <span className="text-white text-xs bg-black/60 px-2 py-1 rounded">Ver</span>
                            </div>
                            {showCam && camId && (
                                <div className="absolute top-1.5 left-1.5">
                                    <span className="text-xs font-semibold text-white bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded">
                                        {camName(camId)}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="px-2.5 py-2 flex items-center justify-between gap-1">
                            <div className="min-w-0">
                                {!showCam && camId && (
                                    <div className="text-xs font-medium text-blue-400 truncate">{camName(camId)}</div>
                                )}
                                <div className="text-slate-500 text-xs">{fmt.date(file.created)}</div>
                            </div>
                            <a href={`/api/screenshots/${file.filename}?download=1`} download className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
                                <Download className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function DiskPanel({ disk }) {
    const { usedGB: used, totalGB: total, availableGB: available, recordingsGB: recGB } = disk;
    const usedPct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    const recPct  = total > 0 ? Math.min((recGB / total) * 100, 100) : 0;
    const freeColor = available < total * 0.1
        ? 'text-red-400' : available < total * 0.25 ? 'text-amber-400' : 'text-green-400';

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">Almacenamiento</span>
            </div>
            <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                        Grabaciones: <span className="text-slate-200 font-medium">{recGB.toFixed(2)} GB</span>
                        {disk.maxGB && <span className="text-slate-500"> / límite {disk.maxGB} GB</span>}
                    </span>
                    <span className={`font-medium ${freeColor}`}>{available.toFixed(1)} GB disponibles</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden flex">
                    <div className="h-full bg-slate-600" style={{ width: `${Math.max(usedPct - recPct, 0)}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${recPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                    <span>Sistema: {(used - recGB).toFixed(1)} GB</span>
                    <span>Total disco: {total.toFixed(0)} GB</span>
                </div>
            </div>
            <StorageEstimate available={available} maxGB={disk.maxGB} maxAgeHours={disk.maxAgeHours} />
        </div>
    );
}

function StorageEstimate({ available, maxGB, maxAgeHours }) {
    const GB_PER_HOUR_PER_CAM = 1.5;
    const effectiveGB = maxGB > 0 ? Math.min(available, maxGB) : available;
    return (
        <div className="border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-400 mb-2">
                Estimación de días grabables con espacio disponible
                <span className="text-slate-600"> (≈1.5 GB/h por cámara a 1080p)</span>:
            </p>
            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => {
                    const days = effectiveGB / (GB_PER_HOUR_PER_CAM * n * 24);
                    const cappedDays = maxAgeHours > 0 ? Math.min(days, maxAgeHours / 24) : days;
                    const color = cappedDays >= 14 ? 'text-green-400' : cappedDays >= 7 ? 'text-amber-400' : 'text-red-400';
                    return (
                        <div key={n} className="bg-slate-900 rounded-lg p-2 text-center">
                            <div className={`text-lg font-bold ${color}`}>
                                {cappedDays >= 1 ? Math.floor(cappedDays) : '<1'}
                            </div>
                            <div className="text-slate-500 text-xs">{n} cám{n > 1 ? 's' : ''}</div>
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
