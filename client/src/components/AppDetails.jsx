import { useState, useEffect, useRef } from 'react';
import {
  fetchApp,
  startApp,
  stopApp,
  restartApp,
  deleteApp,
  fetchLogs,
} from '../api/apps';

export default function AppDetails({ appId, onDeleted, onUpdated }) {
  const [app, setApp] = useState(null);
  const [logs, setLogs] = useState({ out: '', err: '' });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadApp = async () => {
    try {
      const data = await fetchApp(appId);
      setApp(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await fetchLogs(appId);
      setLogs(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setLoading(true);
    loadApp();
    return () => clearInterval(pollRef.current);
  }, [appId]);

  useEffect(() => {
    if (showLogs) {
      loadLogs();
      pollRef.current = setInterval(loadLogs, 3000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [showLogs, appId]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs]);

  const handleAction = async (action, fn) => {
    setActionLoading(action);
    setError('');
    try {
      await fn(appId);
      await loadApp();
      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить приложение? Это действие нельзя отменить.')) return;
    setActionLoading('delete');
    try {
      await deleteApp(appId);
      onDeleted?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Загрузка...</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Приложение не найдено</p>
      </div>
    );
  }

  const pm2Status = app.pm2?.status || app.status;
  const envVars = (() => {
    try {
      return JSON.parse(app.env_vars || '{}');
    } catch {
      return {};
    }
  })();

  const statusColors = {
    online: 'bg-green-400 text-green-400',
    running: 'bg-green-400 text-green-400',
    stopped: 'bg-gray-500 text-gray-400',
    stopping: 'bg-yellow-400 text-yellow-400',
    errored: 'bg-red-400 text-red-400',
    not_found: 'bg-gray-500 text-gray-400',
  };

  const statusColor = statusColors[pm2Status] || statusColors.not_found;
  const [dotColor, textColor] = statusColor.split(' ');

  return (
    <div className="max-w-3xl mx-auto">
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{app.name}</h2>
          <p className="text-gray-500 text-sm font-mono">{app.pm2_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className={`text-sm font-medium ${textColor}`}>
            {pm2Status}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Репозиторий</p>
          <a
            href={app.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 text-sm break-all"
          >
            {app.repo_url}
          </a>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Команда запуска</p>
          <code className="text-green-400 text-sm">{app.start_command}</code>
        </div>
        {app.build_command && (
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Команда сборки</p>
            <code className="text-yellow-400 text-sm">{app.build_command}</code>
          </div>
        )}
        {app.pm2 && app.pm2.status !== 'not_found' && (
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ресурсы</p>
            <div className="text-sm text-gray-300 space-y-1">
              <p>CPU: {app.pm2.cpu}%</p>
              <p>RAM: {(app.pm2.memory / 1024 / 1024).toFixed(1)} MB</p>
              <p>Перезапуски: {app.pm2.restarts}</p>
              {app.pm2.pid && <p>PID: {app.pm2.pid}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Env Vars */}
      {Object.keys(envVars).length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Переменные окружения</h3>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(envVars).map(([key, value]) => (
                  <tr key={key} className="border-b border-gray-700 last:border-0">
                    <td className="px-4 py-2 font-mono text-indigo-300 font-medium">{key}</td>
                    <td className="px-4 py-2 font-mono text-gray-300">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        {pm2Status !== 'online' && pm2Status !== 'running' ? (
          <button
            onClick={() => handleAction('start', startApp)}
            disabled={!!actionLoading}
            className="bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
          >
            {actionLoading === 'start' ? '⏳ Запуск...' : '▶ Запустить'}
          </button>
        ) : (
          <>
            <button
              onClick={() => handleAction('stop', stopApp)}
              disabled={!!actionLoading}
              className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
            >
              {actionLoading === 'stop' ? '⏳ Остановка...' : '⏹ Остановить'}
            </button>
            <button
              onClick={() => handleAction('restart', restartApp)}
              disabled={!!actionLoading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
            >
              {actionLoading === 'restart' ? '⏳ Перезапуск...' : '🔄 Перезапустить'}
            </button>
          </>
        )}
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
        >
          {showLogs ? '📋 Скрыть логи' : '📋 Показать логи'}
        </button>
        <button
          onClick={handleDelete}
          disabled={!!actionLoading}
          className="ml-auto bg-red-700 hover:bg-red-600 disabled:bg-red-900 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
        >
          {actionLoading === 'delete' ? '⏳ Удаление...' : '🗑 Удалить'}
        </button>
      </div>

      {/* Logs */}
      {showLogs && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">📤 Stdout</h3>
            <pre
              ref={logsEndRef}
              className="bg-black rounded-lg p-4 text-xs text-green-300 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap"
            >
              {logs.out || 'Нет логов'}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">📥 Stderr</h3>
            <pre className="bg-black rounded-lg p-4 text-xs text-red-300 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">
              {logs.err || 'Нет логов'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

