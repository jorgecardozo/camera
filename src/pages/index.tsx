import { useState, useEffect } from 'react';
import Head from 'next/head';
import CameraStream from '../components/CameraStream';
import CameraSetup from '../components/CameraSetup';
import FilesViewer from '../components/FilesViewer';
import { Shield, Video, Camera, Settings, Files } from 'lucide-react';

export default function Home() {
  const [cameras, setCameras] = useState([]);
  const [activeTab, setActiveTab] = useState('cameras');
  const [loading, setLoading] = useState(true);

  const fetchCameras = async () => {
    try {
      const response = await fetch('/api/cameras');
      const data = await response.json();
      setCameras(data.cameras || []);
    } catch (error) {
      console.error('Error al cargar cámaras:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
    // Actualizar cada 10 segundos
    const interval = setInterval(fetchCameras, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCameraAdded = () => {
    fetchCameras();
    setActiveTab('cameras');
  };

  return (
    <>
      <Head>
        <title>Sistema de Vigilancia - 4 Cámaras</title>
        <meta name="description" content="Sistema de vigilancia con 4 cámaras IP" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-3">
                <Shield className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">
                  Sistema de Vigilancia
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  {cameras.length} cámaras configuradas
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-600">En línea</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('cameras')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'cameras'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Video className="w-4 h-4 inline mr-2" />
                Vista de Cámaras
              </button>
              <button
                onClick={() => setActiveTab('setup')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'setup'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Settings className="w-4 h-4 inline mr-2" />
                Configuración
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'files'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Files className="w-4 h-4 inline mr-2" />
                Archivos
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {activeTab === 'cameras' && (
            <div>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Cargando cámaras...</p>
                </div>
              ) : cameras.length > 0 ? (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      Vista en Tiempo Real
                    </h2>
                    <p className="text-gray-600">
                      Controla tus {cameras.length} cámaras, graba video y toma capturas
                    </p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {cameras.map((camera: any) => (
                      <CameraStream
                        key={camera.id}
                        camera={camera}
                        onUpdate={fetchCameras}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No hay cámaras configuradas
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Agrega tus primeras cámaras para comenzar la vigilancia
                  </p>
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Configurar Cámaras
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'setup' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Configuración de Cámaras
                </h2>
                <p className="text-gray-600">
                  Agrega y configura tus cámaras IP para el sistema de vigilancia
                </p>
              </div>
              <CameraSetup onCameraAdded={handleCameraAdded} />
            </div>
          )}

          {activeTab === 'files' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Archivo de Grabaciones
                </h2>
                <p className="text-gray-600">
                  Revisa, descarga y gestiona todas tus grabaciones y capturas
                </p>
              </div>
              <FilesViewer />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t mt-12">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <div className="text-center text-sm text-gray-500">
              Sistema de Vigilancia © 2025 - Desarrollado con Next.js
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}