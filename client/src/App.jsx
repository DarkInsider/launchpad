import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import AppForm from './components/AppForm';
import AppDetails from './components/AppDetails';
import { fetchApps } from './api/apps';

function App() {
  const [apps, setApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [mode, setMode] = useState('welcome'); // 'welcome' | 'add' | 'detail'

  const loadApps = useCallback(async () => {
    try {
      const data = await fetchApps();
      setApps(data);
    } catch (err) {
      console.error('Failed to load apps:', err);
    }
  }, []);

  useEffect(() => {
    loadApps();
    // Poll apps list every 5 seconds to keep statuses up to date
    const interval = setInterval(loadApps, 5000);
    return () => clearInterval(interval);
  }, [loadApps]);

  const handleSelectApp = (id) => {
    setSelectedAppId(id);
    setMode('detail');
  };

  const handleAddNew = () => {
    setSelectedAppId(null);
    setMode('add');
  };

  const handleCreated = (id) => {
    loadApps();
    setSelectedAppId(id);
    setMode('detail');
  };

  const handleDeleted = () => {
    loadApps();
    setSelectedAppId(null);
    setMode('welcome');
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar
        apps={apps}
        selectedAppId={selectedAppId}
        onSelect={handleSelectApp}
        onAddNew={handleAddNew}
      />

      <main className="flex-1 overflow-y-auto p-8">
        {mode === 'welcome' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-6xl mb-4">🚀</p>
            <h2 className="text-xl font-medium mb-2">Добро пожаловать в Launchpad</h2>
            <p className="text-sm">Выберите приложение из списка или добавьте новое</p>
          </div>
        )}

        {mode === 'add' && (
          <AppForm
            onCreated={handleCreated}
            onCancel={() => setMode('welcome')}
          />
        )}

        {mode === 'detail' && selectedAppId && (
          <AppDetails
            appId={selectedAppId}
            onDeleted={handleDeleted}
            onUpdated={loadApps}
          />
        )}
      </main>
    </div>
  );
}

export default App;
