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
  continuousRecord?: boolean;
  motionDetect?: boolean;
  motionActive?: boolean;
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
    const interval = setInterval(fetchCameras, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && cameras.length === 0) setActiveTab('setup');
  }, [loading]);

  const tabs = [
    { id: 'cameras', label: 'Cámaras', icon: Video },
    { id: 'setup',   label: 'Config',  icon: Settings },
    { id: 'files',   label: 'Archivos', icon: Files },
  ];

  const onlineCount = cameras.filter(c => (c as Camera & { isOnline?: boolean }).isOnline !== false).length;

  return (
    <>
      <Head>
        <title>Vigilancia</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#020617" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 sticky top-0 z-40"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold tracking-tight">Vigilancia</span>
            </div>
            <div className="flex items-center gap-3">
              {cameras.length > 0 && (
                <span className="text-slate-500 text-xs hidden sm:block">{cameras.length} cámaras</span>
              )}
              {onlineCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs font-medium">{onlineCount} en línea</span>
                </div>
              )}
            </div>
          </div>

          {/* Top nav — visible only on sm+ */}
          <nav className="hidden sm:block border-t border-slate-800/60">
            <div className="max-w-7xl mx-auto px-4 flex gap-1">
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
        </header>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-4 py-4 pb-24 sm:pb-6">
          {activeTab === 'cameras' && (
            loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 text-sm">Conectando cámaras...</p>
              </div>
            ) : cameras.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cameras.map((camera) => (
                  <CameraStream key={camera.id} camera={camera} onUpdate={fetchCameras} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
                  <Video className="w-8 h-8 text-slate-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-slate-200 font-medium mb-1">Sin cámaras configuradas</h3>
                  <p className="text-slate-500 text-sm">Agregá tus cámaras desde Configuración</p>
                </div>
                <button
                  onClick={() => setActiveTab('setup')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Ir a Configuración
                </button>
              </div>
            )
          )}

          <div className={activeTab === 'setup' ? '' : 'hidden'}>
            <CameraSetup
              cameras={cameras}
              autoScan={cameras.length === 0}
              onCameraAdded={() => { fetchCameras(); setActiveTab('cameras'); }}
            />
          </div>

          {activeTab === 'files' && <FilesViewer cameras={cameras} />}
        </main>

        {/* Bottom tab bar — mobile only */}
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  activeTab === id ? 'text-blue-400' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${activeTab === id ? 'text-blue-400' : 'text-slate-500'}`} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}
