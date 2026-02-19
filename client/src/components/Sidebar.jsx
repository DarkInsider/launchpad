export default function Sidebar({ apps, selectedAppId, onSelect, onAddNew }) {
  return (
    <aside className="w-72 bg-gray-900 border-r border-gray-700 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          🚀 Launchpad
        </h1>
      </div>

      {/* Add New Button */}
      <div className="p-3">
        <button
          onClick={onAddNew}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 px-4 font-medium transition-colors cursor-pointer"
        >
          + Добавить приложение
        </button>
      </div>

      {/* App List */}
      <div className="flex-1 overflow-y-auto">
        {apps.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            Нет приложений
          </p>
        )}
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onSelect(app.id)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
              selectedAppId === app.id
                ? 'bg-gray-800 border-l-4 border-indigo-500'
                : 'hover:bg-gray-800 border-l-4 border-transparent'
            }`}
          >
            {/* Status dot */}
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                app.status === 'running'
                  ? 'bg-green-400'
                  : app.status === 'errored'
                  ? 'bg-red-400'
                  : 'bg-gray-500'
              }`}
            />
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {app.name}
              </p>
              <p className="text-gray-500 text-xs truncate">{app.pm2_name}</p>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

