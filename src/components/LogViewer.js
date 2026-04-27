import { useState, useEffect, useRef } from 'react';
import { Terminal, Pause, Play, Trash2, ChevronDown } from 'lucide-react';

const LEVEL_COLORS = {
    error: 'text-red-400',
    warn:  'text-amber-400',
    info:  'text-slate-300',
};

export default function LogViewer() {
    const [lines, setLines]       = useState([]);
    const [paused, setPaused]     = useState(false);
    const [filter, setFilter]     = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const sinceRef   = useRef(-1);
    const bottomRef  = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (paused) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/logs?last=300&since=${sinceRef.current}`);
                if (!res.ok) return;
                const { lines: newLines, total } = await res.json();
                if (newLines.length > 0) {
                    sinceRef.current = total - 1;
                    setLines(prev => {
                        const next = [...prev, ...newLines].slice(-600);
                        return next;
                    });
                }
            } catch (_) {}
        };

        poll();
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
    }, [paused]);

    // Auto-scroll to bottom when new lines arrive
    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [lines, autoScroll]);

    const handleScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setAutoScroll(atBottom);
    };

    const filtered = filter
        ? lines.filter(l => l.msg.toLowerCase().includes(filter.toLowerCase()))
        : lines;

    const fmt = (iso) => {
        const d = new Date(iso);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60">
                <Terminal className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-300 text-sm font-medium flex-1">Logs del servidor</span>
                <input
                    type="text"
                    placeholder="Filtrar..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-1 text-xs w-40
                        focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
                <button
                    onClick={() => setPaused(p => !p)}
                    title={paused ? 'Reanudar' : 'Pausar'}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400
                        hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={() => { setLines([]); sinceRef.current = -1; }}
                    title="Limpiar"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400
                        hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                {!autoScroll && (
                    <button
                        onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView(); }}
                        title="Ir al final"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-400
                            hover:text-blue-300 hover:bg-slate-800 transition-colors"
                    >
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                )}
                {paused && <span className="text-amber-400 text-xs font-medium">PAUSADO</span>}
            </div>

            {/* Log output */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="h-80 overflow-y-auto font-mono text-xs leading-5 p-3 space-y-px"
            >
                {filtered.length === 0 ? (
                    <p className="text-slate-600 italic">Sin logs todavía...</p>
                ) : (
                    filtered.map((l, i) => (
                        <div key={i} className="flex gap-2 hover:bg-slate-800/40 rounded px-1">
                            <span className="text-slate-600 shrink-0 select-none">{fmt(l.t)}</span>
                            <span className={`break-all ${LEVEL_COLORS[l.level] || 'text-slate-300'}`}>
                                {l.msg}
                            </span>
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
