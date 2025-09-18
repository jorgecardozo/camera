import { useState } from 'react';
import { Plus, Wifi, Settings } from 'lucide-react';

export default function CameraSetup({ onCameraAdded }) {
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        ip: '',
        port: '554',
        httpPort: '80',
        username: '',
        password: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                setMessage('Cámara agregada exitosamente');
                setFormData({
                    id: '',
                    name: '',
                    ip: '',
                    port: '554',
                    httpPort: '80',
                    username: '',
                    password: ''
                });
                setShowForm(false);
                onCameraAdded && onCameraAdded();
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
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const presetCameras = [
        {
            id: 'cam1',
            name: 'Cámara Entrada',
            ip: '192.168.18.13',
            username: 'rwra',
            password: 'mf6n5e'
        },
        {
            id: 'cam2',
            name: 'Cámara Sala',
            ip: '192.168.1.102',
            username: 'admin',
            password: 'admin123'
        },
        {
            id: 'cam3',
            name: 'Cámara Cocina',
            ip: '192.168.1.103',
            username: 'admin',
            password: 'admin123'
        },
        {
            id: 'cam4',
            name: 'Cámara Exterior',
            ip: '192.168.1.104',
            username: 'admin',
            password: 'admin123'
        }
    ];

    const addPresetCamera = (preset) => {
        setFormData({
            ...formData,
            ...preset,
            port: '554',
            httpPort: '80'
        });
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="w-6 h-6" />
                    Configuración de Cámaras
                </h2>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    <Plus className="w-4 h-4" />
                    Agregar Cámara
                </button>
            </div>

            {/* Cámaras preset */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Wifi className="w-5 h-5" />
                    Configuraciones Rápidas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {presetCameras.map((preset) => (
                        <button
                            key={preset.id}
                            onClick={() => addPresetCamera(preset)}
                            className="p-3 border border-gray-300 rounded hover:bg-gray-50 text-left"
                        >
                            <div className="font-medium">{preset.name}</div>
                            <div className="text-sm text-gray-500">{preset.ip}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Formulario */}
            {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">ID de Cámara</label>
                            <input
                                type="text"
                                name="id"
                                value={formData.id}
                                onChange={handleChange}
                                placeholder="ej: cam1"
                                required
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Nombre</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="ej: Cámara Entrada"
                                required
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Dirección IP</label>
                            <input
                                type="text"
                                name="ip"
                                value={formData.ip}
                                onChange={handleChange}
                                placeholder="192.168.1.100"
                                required
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Puerto RTSP</label>
                            <input
                                type="number"
                                name="port"
                                value={formData.port}
                                onChange={handleChange}
                                placeholder="554"
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Puerto HTTP</label>
                            <input
                                type="number"
                                name="httpPort"
                                value={formData.httpPort}
                                onChange={handleChange}
                                placeholder="80"
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Usuario</label>
                            <input
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="admin"
                                required
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Contraseña</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="contraseña"
                                required
                                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {isLoading ? 'Agregando...' : 'Agregar Cámara'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {/* Mensaje */}
            {message && (
                <div className={`mt-4 p-3 rounded ${message.includes('Error')
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                    }`}>
                    {message}
                </div>
            )}
        </div>
    );
}