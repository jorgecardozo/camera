import { Camera, CheckCircle } from 'lucide-react';

export default function OnboardingBanner({ verifiedCameras, onAddAll, onDismiss, isAdding }) {
    return (
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-900 rounded-full flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                    <h2 className="text-white font-semibold text-lg mb-1">
                        {verifiedCameras.length === 1
                            ? '¡Encontramos 1 cámara en tu red!'
                            : `¡Encontramos ${verifiedCameras.length} cámaras en tu red!`}
                    </h2>
                    <p className="text-blue-300 text-sm mb-4">
                        Detectamos las credenciales automáticamente. Podés agregarlas todas con un click.
                    </p>
                    <ul className="space-y-1 mb-4">
                        {verifiedCameras.map(cam => (
                            <li key={cam.ip} className="flex items-center gap-2 text-sm text-slate-300">
                                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                                <span>{cam.ip}</span>
                                {cam.brand && <span className="text-slate-500">— {cam.brand}</span>}
                            </li>
                        ))}
                    </ul>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onAddAll}
                            disabled={isAdding}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {isAdding ? 'Agregando...' : `Agregar todas (${verifiedCameras.length})`}
                        </button>
                        <button
                            onClick={onDismiss}
                            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            Configurar manualmente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
