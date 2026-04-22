import { useState, useEffect } from 'react';
import Head from 'next/head';
import CameraStream from '../components/CameraStream';
import CameraSetup from '../components/CameraSetup';
import FilesViewer from '../components/FilesViewer';
import { Shield, Video, Settings, Files } from 'lucide-react';

type Camera = {
  id: string;
  name: string;
  ip: string;
  isRecording?: boolean;
};

export default function Home() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [activeTab, setActiveTab] = useState('cameras');
  const [loading, setLoading] = useState(true);

  const fetchCameras = async () => {
    try {
      const response = await fetch('/api/cameras');
      const data = await response.json();
      setCameras(data.cameras || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
    const interval = setInterval(fetchCameras, 10000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'cameras', label: 'Cámaras', icon: Video },
    { id: 'setup', label: 'Configuración', icon: Settings },
    { id: 'files', label: 'Archivos', icon: Files },
  ];

  return (
    <>
      <Head>
        <title>Vigilancia</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
          <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-blue-500" />
              <span className="text-white font-semibold text-lg">Vigilancia</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">{cameras.length} cámaras</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm">En línea</span>
              </div>
            </div>
          </div>
        </header>

        {/* Nav */}
        <nav className="bg-slate-900 border-b border-slate-800">
          <div className="max-w-screen-xl mx-auto px-4 flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="max-w-screen-xl mx-auto px-4 py-6">
          {activeTab === 'cameras' && (
            loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400">Conectando cámaras...</p>
              </div>
            ) : cameras.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {cameras.map((camera) => (
                  <CameraStream key={camera.id} camera={camera} onUpdate={fetchCameras} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
                  <Video className="w-8 h-8 text-slate-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-slate-200 font-medium mb-1">Sin cámaras configuradas</h3>
                  <p className="text-slate-500 text-sm">Agregá tus cámaras desde la pestaña Configuración</p>
                </div>
                <button
                  onClick={() => setActiveTab('setup')}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Ir a Configuración
                </button>
              </div>
            )
          )}

          {activeTab === 'setup' && (
            <CameraSetup onCameraAdded={() => { fetchCameras(); setActiveTab('cameras'); }} />
          )}

          {activeTab === 'files' && <FilesViewer />}
        </main>
      </div>
    </>
  );
}
