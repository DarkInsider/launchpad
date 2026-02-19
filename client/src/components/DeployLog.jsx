import { useState, useEffect, useRef } from 'react';

const LEVEL_STYLES = {
  step: 'text-cyan-400 font-semibold',
  info: 'text-gray-300',
  success: 'text-green-400',
  warn: 'text-yellow-400',
  error: 'text-red-400 font-semibold',
};

const LEVEL_ICONS = {
  step: '▸',
  info: ' ',
  success: '✓',
  warn: '⚠',
  error: '✗',
};

export default function DeployLog({ appId, expanded = false }) {
  const [entries, setEntries] = useState([]);
  const [isOpen, setIsOpen] = useState(expanded);
  const containerRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!appId) return;

    // Close previous connection
    eventSourceRef.current?.close();
    setEntries([]);

    const url = `/api/apps/${appId}/events`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        setEntries((prev) => [...prev, entry]);
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // SSE will auto-reconnect, no action needed
    };

    return () => {
      es.close();
    };
  }, [appId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  if (!appId) return null;

  const hasErrors = entries.some((e) => e.level === 'error');
  const lastEntry = entries[entries.length - 1];

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header - clickable to toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-gray-400 font-medium">Консоль деплоя</span>
          {entries.length > 0 && (
            <span className="text-gray-600 text-xs">({entries.length} записей)</span>
          )}
          {hasErrors && (
            <span className="bg-red-900/50 text-red-400 text-xs px-1.5 py-0.5 rounded">
              ошибки
            </span>
          )}
        </div>
        {lastEntry && !isOpen && (
          <span className={`text-xs truncate max-w-md ${LEVEL_STYLES[lastEntry.level] || 'text-gray-500'}`}>
            {lastEntry.message}
          </span>
        )}
      </button>

      {/* Log content */}
      {isOpen && (
        <div
          ref={containerRef}
          className="max-h-80 overflow-y-auto border-t border-gray-700 bg-black/50 p-3 font-mono text-xs leading-relaxed"
        >
          {entries.length === 0 ? (
            <p className="text-gray-600 italic">Ожидание логов...</p>
          ) : (
            entries.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-600 select-none shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`select-none ${LEVEL_STYLES[entry.level] || ''}`}>
                  {LEVEL_ICONS[entry.level] || ' '}
                </span>
                <span className={`whitespace-pre-wrap break-all ${LEVEL_STYLES[entry.level] || 'text-gray-400'}`}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

