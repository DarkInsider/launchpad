import { useState } from 'react';
import { createApp, startApp } from '../api/apps';
import DeployLog from './DeployLog';

const EMPTY_ENV_ROW = { key: '', value: '' };

export default function AppForm({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [envRows, setEnvRows] = useState([{ ...EMPTY_ENV_ROW }]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [launchAfterCreate, setLaunchAfterCreate] = useState(true);
  const [createdAppId, setCreatedAppId] = useState(null);

  const addEnvRow = () => setEnvRows([...envRows, { ...EMPTY_ENV_ROW }]);

  const removeEnvRow = (index) => {
    setEnvRows(envRows.filter((_, i) => i !== index));
  };

  const updateEnvRow = (index, field, value) => {
    const updated = [...envRows];
    updated[index] = { ...updated[index], [field]: value };
    setEnvRows(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStatus('Создание приложения...');
    setCreatedAppId(null);

    try {
      // Build env_vars object from rows
      const env_vars = {};
      envRows.forEach((row) => {
        if (row.key.trim()) {
          env_vars[row.key.trim()] = row.value;
        }
      });

      const app = await createApp({
        name,
        repo_url: repoUrl,
        build_command: buildCommand,
        start_command: startCommand,
        env_vars,
      });

      setCreatedAppId(app.id);

      if (launchAfterCreate) {
        setStatus('Клонирование репозитория и запуск...');
        try {
          await startApp(app.id);
          setStatus('');
          onCreated(app.id);
        } catch (err) {
          setError(`Приложение создано, но запуск не удался: ${err.response?.data?.error || err.message}`);
          setLoading(false);
          setStatus('');
          return;
        }
      } else {
        setStatus('');
        onCreated(app.id);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Новое приложение</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">
          {error}
          {createdAppId && (
            <button
              onClick={() => onCreated(createdAppId)}
              className="ml-3 underline text-red-300 hover:text-white transition-colors"
            >
              Перейти к приложению →
            </button>
          )}
        </div>
      )}

      {status && (
        <div className="bg-indigo-900/50 border border-indigo-700 text-indigo-200 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {status}
        </div>
      )}

      {/* Deploy Log Console — shows once app is created */}
      {createdAppId && (
        <div className="mb-4">
          <DeployLog appId={createdAppId} expanded={true} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="My App"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Repo URL */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            GitHub репозиторий
          </label>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
            placeholder="https://github.com/user/repo.git"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Build Command */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Команда сборки (опционально)
          </label>
          <input
            type="text"
            value={buildCommand}
            onChange={(e) => setBuildCommand(e.target.value)}
            placeholder="npm install && npm run build"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        {/* Start Command */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Команда запуска
          </label>
          <input
            type="text"
            value={startCommand}
            onChange={(e) => setStartCommand(e.target.value)}
            required
            placeholder="npm start"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        {/* Environment Variables */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Переменные окружения
          </label>
          <div className="space-y-2">
            {envRows.map((row, i) => (
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
                  title="Удалить"
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

        {/* Launch after create checkbox */}
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={launchAfterCreate}
            onChange={(e) => setLaunchAfterCreate(e.target.checked)}
            className="accent-indigo-500"
          />
          Запустить сразу после создания
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white rounded-lg py-2.5 px-4 font-medium transition-colors"
        >
          {loading ? 'Создание...' : launchAfterCreate ? '🚀 Создать и запустить' : 'Создать'}
        </button>
      </form>
    </div>
  );
}


