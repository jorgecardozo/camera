import { useState, useEffect } from 'react';
import { Video, Camera, Download, X, RefreshCw, HardDrive, Activity } from 'lucide-react';

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
    const [events, setEvents]           = useState([]);
    const [diskStatus, setDiskStatus]   = useState(null);
    const [activeTab, setActiveTab]     = useState('recordings');
    const [activeCam, setActiveCam]     = useState('all');
    const [loading, setLoading]         = useState(false);
    const [lightbox, setLightbox]       = useState(null);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const camFilter = activeCam !== 'all' ? `&cameraId=${activeCam}` : '';
            const [recRes, ssRes, diskRes, evRes] = await Promise.all([
                fetch('/api/files?type=recordings'),
                fetch('/api/files?type=screenshots'),
                fetch('/api/files?type=disk-status'),
                fetch(`/api/events?limit=50${camFilter}`),
            ]);
            setRecordings((await recRes.json()).recordings || []);
            setScreenshots((await ssRes.json()).screenshots || []);
            setDiskStatus(diskRes.ok ? await diskRes.json() : null);
            setEvents(evRes.ok ? (await evRes.json()).events || [] : []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCam]);

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

    // Camera IDs that actually appear in files or events (sorted by id)
    const camIdsInFiles = [...new Set([
        ...recordings.map(f => extractCameraId(f.filename)),
        ...screenshots.map(f => extractCameraId(f.filename)),
        ...events.map(e => e.cameraId),
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
                    className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    onClick={() => setLightbox(null)}
                >
                    <button className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-black/40 rounded-xl">
                        <X className="w-6 h-6" />
                    </button>
                    <img
                        src={lightbox}
                        alt="Captura"
                        className="max-w-full max-h-full rounded-xl"
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
            <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-slate-800/80 rounded-xl p-1 flex-1">
                    <TabBtn active={activeTab === 'recordings'} onClick={() => setActiveTab('recordings')} icon={Video} count={filteredRec.length}>
                        <span className="hidden sm:inline">Grabaciones</span>
                        <span className="sm:hidden">Video</span>
                    </TabBtn>
                    <TabBtn active={activeTab === 'screenshots'} onClick={() => setActiveTab('screenshots')} icon={Camera} count={filteredSS.length}>
                        <span className="hidden sm:inline">Capturas</span>
                        <span className="sm:hidden">Fotos</span>
                    </TabBtn>
                    <TabBtn active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={Activity} count={events.length}>
                        Eventos
                    </TabBtn>
                </div>
                <button
                    onClick={fetchFiles}
                    disabled={loading}
                    className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-colors disabled:opacity-40 shrink-0"
                    title="Actualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Content */}
            {loading && !recordings.length && !screenshots.length && !events.length ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : activeTab === 'recordings' ? (
                filteredRec.length === 0
                    ? <EmptyState icon={Video} text="No hay grabaciones" />
                    : <RecordingList files={filteredRec} fmt={fmt} camName={camName} showCam={activeCam === 'all'} />
            ) : activeTab === 'screenshots' ? (
                filteredSS.length === 0
                    ? <EmptyState icon={Camera} text="No hay capturas" />
                    : <ScreenshotGrid files={filteredSS} fmt={fmt} camName={camName} showCam={activeCam === 'all'} onOpen={setLightbox} />
            ) : (
                events.length === 0
                    ? <EmptyState icon={Activity} text="No hay eventos de detección" />
                    : <EventsList events={events} fmt={fmt} />
            )}
        </div>
    );
}

function CamChip({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
        >
            {children}
        </button>
    );
}

function TabBtn({ active, onClick, icon: Icon, count, children }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-center gap-1.5 flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
        >
            <Icon className="w-4 h-4 shrink-0" />
            {children}
            {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

function RecordingList({ files, fmt, camName, showCam }) {
    return (
        <div className="space-y-3">
            {files.map((file, i) => {
                const camId = extractCameraId(file.filename);
                return (
                    <div key={i} className="bg-slate-800/80 border border-slate-700/60 rounded-2xl overflow-hidden">
                        <video
                            className="w-full bg-black"
                            controls
                            preload="none"
                            src={`/api/recordings/${file.filename}`}
                        />
                        <div className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                {showCam && camId && (
                                    <span className="inline-block text-xs font-semibold text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full mb-1">
                                        {camName(camId)}
                                    </span>
                                )}
                                <div className="text-slate-400 text-xs">
                                    {fmt.date(file.created)} · {fmt.size(file.size)}
                                </div>
                            </div>
                            <a
                                href={`/api/recordings/${file.filename}?download=1`}
                                download
                                className="shrink-0 w-10 h-10 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors"
                                title="Descargar"
                            >
                                <Download className="w-4 h-4" />
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
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300 text-sm font-medium">Almacenamiento</span>
                </div>
                <span className={`text-sm font-semibold ${freeColor}`}>{available.toFixed(1)} GB libres</span>
            </div>
            <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-slate-700 overflow-hidden flex">
                    <div className="h-full bg-slate-600/80" style={{ width: `${Math.max(usedPct - recPct, 0)}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${recPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                    <span>Grabaciones: <span className="text-slate-300 font-medium">{recGB.toFixed(1)} GB</span>
                        {disk.maxGB ? <span className="text-slate-600"> / {disk.maxGB} GB</span> : ''}</span>
                    <span>Total: {total.toFixed(0)} GB</span>
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
        <div className="border-t border-slate-700/60 pt-3">
            <p className="text-xs text-slate-500 mb-2">Días grabables estimados <span className="text-slate-600">(≈1.5 GB/h · 1080p)</span></p>
            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => {
                    const days = effectiveGB / (GB_PER_HOUR_PER_CAM * n * 24);
                    const cappedDays = maxAgeHours > 0 ? Math.min(days, maxAgeHours / 24) : days;
                    const color = cappedDays >= 14 ? 'text-green-400' : cappedDays >= 7 ? 'text-amber-400' : 'text-red-400';
                    return (
                        <div key={n} className="bg-slate-900/60 rounded-xl p-2 text-center">
                            <div className={`text-xl font-bold ${color}`}>
                                {cappedDays >= 1 ? Math.floor(cappedDays) : '<1'}
                            </div>
                            <div className="text-slate-500 text-xs mt-0.5">{n} cam{n > 1 ? 's' : ''}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EventsList({ events, fmt }) {
    return (
        <div className="space-y-2">
            {events.map((event, i) => (
                <div key={event.id ?? i} className="flex gap-3 items-center p-3 bg-slate-800/80 border border-slate-700/60 rounded-2xl">
                    {event.screenshotPath ? (
                        <img
                            src={event.screenshotPath}
                            alt="Captura"
                            className="w-16 h-12 object-cover rounded-lg shrink-0"
                        />
                    ) : (
                        <div className="w-16 h-12 bg-slate-700 rounded-lg shrink-0 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-slate-500" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="text-white font-semibold text-sm">
                            {event.label} <span className="text-slate-400 font-normal">({Math.round(event.confidence * 100)}%)</span>
                        </div>
                        <div className="text-slate-400 text-xs">{event.cameraName || event.cameraId}</div>
                        <div className="text-slate-600 text-xs">{fmt.date(event.timestamp)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function EmptyState({ icon: Icon, text }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 bg-slate-800/80 rounded-2xl flex items-center justify-center">
                <Icon className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm">{text}</p>
        </div>
    );
}
