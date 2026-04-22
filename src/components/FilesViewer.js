import { useState, useEffect } from 'react';
import { Video, Camera, Download, X, RefreshCw } from 'lucide-react';

export default function FilesViewer() {
    const [recordings, setRecordings] = useState([]);
    const [screenshots, setScreenshots] = useState([]);
    const [activeTab, setActiveTab] = useState('recordings');
    const [loading, setLoading] = useState(false);
    const [lightbox, setLightbox] = useState(null);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const [recRes, ssRes] = await Promise.all([
                fetch('/api/files?type=recordings'),
                fetch('/api/files?type=screenshots'),
            ]);
            const recData = await recRes.json();
            const ssData = await ssRes.json();
            setRecordings(recData.recordings || []);
            setScreenshots(ssData.screenshots || []);
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
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }),
    };

    const totalSize = (arr) => arr.reduce((s, f) => s + (f.size || 0), 0);

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

            {/* Stats bar */}
            <div className="bg-slate-800 rounded-lg px-4 py-2.5 flex gap-6 text-sm">
                <span className="text-slate-400">Grabaciones: <span className="text-slate-200">{recordings.length}</span></span>
                <span className="text-slate-400">Capturas: <span className="text-slate-200">{screenshots.length}</span></span>
                <span className="text-slate-400">Tamaño video: <span className="text-slate-200">{fmt.size(totalSize(recordings))}</span></span>
                <span className="text-slate-400">Tamaño capturas: <span className="text-slate-200">{fmt.size(totalSize(screenshots))}</span></span>
            </div>

            {/* Content */}
            {loading && (recordings.length === 0 && screenshots.length === 0) ? (
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
