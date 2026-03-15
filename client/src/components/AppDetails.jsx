import { useState, useEffect, useRef } from 'react';
import {
  fetchApp,
  startApp,
  stopApp,
  restartApp,
  redeployApp,
  deleteApp,
  updateApp,
  fetchLogs,
} from '../api/apps';
import DeployLog from './DeployLog';

const EMPTY_ENV_ROW = { key: '', value: '' };

export default function AppDetails({ appId, onDeleted, onUpdated }) {
  const [app, setApp] = useState(null);
  const [logs, setLogs] = useState({ out: '', err: '' });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [editing, setEditing] = useState(false);
  const logsEndRef = useRef(null);
  const pollRef = useRef(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editRepoUrl, setEditRepoUrl] = useState('');
  const [editBuildCommand, setEditBuildCommand] = useState('');
  const [editStartCommand, setEditStartCommand] = useState('');
  const [editEnvRows, setEditEnvRows] = useState([{ ...EMPTY_ENV_ROW }]);
  const [saveLoading, setSaveLoading] = useState(false);

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

  const startEditing = () => {
    if (!app) return;
    setEditName(app.name);
    setEditRepoUrl(app.repo_url);
    setEditBuildCommand(app.build_command || '');
    setEditStartCommand(app.start_command);
    const envVars = (() => {
      try { return JSON.parse(app.env_vars || '{}'); } catch { return {}; }
    })();
    const rows = Object.entries(envVars).map(([key, value]) => ({ key, value }));
    setEditEnvRows(rows.length > 0 ? rows : [{ ...EMPTY_ENV_ROW }]);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setError('');
    try {
      const env_vars = {};
      editEnvRows.forEach((row) => {
        if (row.key.trim()) {
          env_vars[row.key.trim()] = row.value;
        }
      });

      await updateApp(appId, {
        name: editName,
        repo_url: editRepoUrl,
        build_command: editBuildCommand,
        start_command: editStartCommand,
        env_vars,
      });

      setEditing(false);
      await loadApp();
      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const addEnvRow = () => setEditEnvRows([...editEnvRows, { ...EMPTY_ENV_ROW }]);
  const removeEnvRow = (index) => setEditEnvRows(editEnvRows.filter((_, i) => i !== index));
  const updateEnvRow = (index, field, value) => {
    const updated = [...editEnvRows];
    updated[index] = { ...updated[index], [field]: value };
    setEditEnvRows(updated);
  };

  useEffect(() => {
    setLoading(true);
    setEditing(false);
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
        <div className="flex items-center gap-3">
          <button
            onClick={editing ? cancelEditing : startEditing}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            {editing ? '✕ Отмена' : '✏️ Редактировать'}
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
            <span className={`text-sm font-medium ${textColor}`}>
              {pm2Status}
            </span>
          </div>
        </div>
      </div>

      {/* Edit Mode */}
      {editing ? (
        <div className="space-y-5 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Название</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">GitHub репозиторий</label>
            <input
              type="url"
              value={editRepoUrl}
              onChange={(e) => setEditRepoUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Команда сборки (опционально)</label>
            <input
              type="text"
              value={editBuildCommand}
              onChange={(e) => setEditBuildCommand(e.target.value)}
              placeholder="npm install && npm run build"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Команда запуска</label>
            <input
              type="text"
              value={editStartCommand}
              onChange={(e) => setEditStartCommand(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Переменные окружения</label>
            <div className="space-y-2">
              {editEnvRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateEnvRow(i, 'key', e.target.value)}
                    placeholder="KEY"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateEnvRow(i, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvRow(i)}
                    className="text-gray-500 hover:text-red-400 px-2 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addEnvRow}
              className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Добавить переменную
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveLoading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
            >
              {saveLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={cancelEditing}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
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
          onClick={() => handleAction('redeploy', redeployApp)}
          disabled={!!actionLoading}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg py-2 px-4 font-medium transition-colors text-sm"
        >
          {actionLoading === 'redeploy' ? '⏳ Редеплой...' : '🔁 Редеплой'}
        </button>
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

      {/* Deploy Log Console */}
      <div className="mb-6">
        <DeployLog appId={appId} />
      </div>

      {/* PM2 Process Logs */}
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
