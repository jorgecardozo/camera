import { useState, useEffect } from 'react';
import { Video, Camera, Download, Calendar, HardDrive } from 'lucide-react';

export default function FilesViewer() {
    const [recordings, setRecordings] = useState([]);
    const [screenshots, setScreenshots] = useState([]);
    const [activeTab, setActiveTab] = useState('recordings');
    const [loading, setLoading] = useState(false);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            // Obtener grabaciones
            const recordingsResponse = await fetch('/api/files?type=recordings');
            const recordingsData = await recordingsResponse.json();
            setRecordings(recordingsData.recordings || []);

            // Obtener screenshots
            const screenshotsResponse = await fetch('/api/files?type=screenshots');
            const screenshotsData = await screenshotsResponse.json();
            setScreenshots(screenshotsData.screenshots || []);
        } catch (error) {
            console.error('Error al cargar archivos:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
        // Actualizar cada 30 segundos
        const interval = setInterval(fetchFiles, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const FileCard = ({ file, type }) => (
        <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    {type === 'recording' ? (
                        <Video className="w-8 h-8 text-blue-500" />
                    ) : (
                        <Camera className="w-8 h-8 text-green-500" />
                    )}
                    <div>
                        <h3 className="font-medium text-gray-900 truncate max-w-xs">
                            {file.filename}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(file.created)}
                            </span>
                            <span className="flex items-center gap-1">
                                <HardDrive className="w-4 h-4" />
                                {formatFileSize(file.size)}
                            </span>
                        </div>
                    </div>
                </div>
                <a
                    href={file.path}
                    download
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Descargar
                </a>
            </div>

            {type === 'recording' ? (
                <div className="mt-3">
                    <video
                        className="w-full h-32 bg-black rounded object-cover"
                        controls
                        preload="metadata"
                    >
                        <source src={file.path} type="video/mp4" />
                        Tu navegador no soporta video HTML5.
                    </video>
                </div>
            ) : (
                <div className="mt-3">
                    <img
                        src={file.path}
                        alt="Screenshot"
                        className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(file.path, '_blank')}
                    />
                </div>
            )}
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Archivos de Vigilancia</h2>

            {/* Tabs */}
            <div className="flex space-x-1 mb-6">
                <button
                    onClick={() => setActiveTab('recordings')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'recordings'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                >
                    <Video className="w-4 h-4 inline mr-2" />
                    Grabaciones ({recordings.length})
                </button>
                <button
                    onClick={() => setActiveTab('screenshots')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'screenshots'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                >
                    <Camera className="w-4 h-4 inline mr-2" />
                    Capturas ({screenshots.length})
                </button>
            </div>

            {/* Botón de actualizar */}
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">
                    {activeTab === 'recordings'
                        ? `${recordings.length} grabaciones encontradas`
                        : `${screenshots.length} capturas encontradas`
                    }
                </div>
                <button
                    onClick={fetchFiles}
                    disabled={loading}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                >
                    {loading ? 'Actualizando...' : 'Actualizar'}
                </button>
            </div>

            {/* Contenido */}
            {loading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Cargando archivos...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeTab === 'recordings' ? (
                        recordings.length > 0 ? (
                            recordings.map((file, index) => (
                                <FileCard key={index} file={file} type="recording" />
                            ))
                        ) : (
                            <div className="col-span-full text-center py-8 text-gray-500">
                                <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                No hay grabaciones disponibles
                            </div>
                        )
                    ) : (
                        screenshots.length > 0 ? (
                            screenshots.map((file, index) => (
                                <FileCard key={index} file={file} type="screenshot" />
                            ))
                        ) : (
                            <div className="col-span-full text-center py-8 text-gray-500">
                                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                No hay capturas disponibles
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Estadísticas */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Estadísticas de Almacenamiento</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <div className="text-gray-600">Total Grabaciones</div>
                        <div className="font-semibold">{recordings.length}</div>
                    </div>
                    <div>
                        <div className="text-gray-600">Total Capturas</div>
                        <div className="font-semibold">{screenshots.length}</div>
                    </div>
                    <div>
                        <div className="text-gray-600">Tamaño Grabaciones</div>
                        <div className="font-semibold">
                            {formatFileSize(recordings.reduce((total, file) => total + file.size, 0))}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-600">Tamaño Capturas</div>
                        <div className="font-semibold">
                            {formatFileSize(screenshots.reduce((total, file) => total + file.size, 0))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}