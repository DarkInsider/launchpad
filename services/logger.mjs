/**
 * In-memory event logger for deploy operations.
 * Stores per-app logs and provides SSE streaming.
 */

const MAX_ENTRIES_PER_APP = 500;

// appId -> LogEntry[]
const appLogs = new Map();

// appId -> Set<(entry) => void>
const subscribers = new Map();

/**
 * @typedef {'info' | 'success' | 'error' | 'warn' | 'step'} LogLevel
 * @typedef {{ timestamp: string, level: LogLevel, message: string, appId: number|string }} LogEntry
 */

export function log(appId, level, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    appId,
  };

  // Store
  if (!appLogs.has(appId)) {
    appLogs.set(appId, []);
  }
  const logs = appLogs.get(appId);
  logs.push(entry);
  if (logs.length > MAX_ENTRIES_PER_APP) {
    logs.splice(0, logs.length - MAX_ENTRIES_PER_APP);
  }

  // Notify subscribers
  const subs = subscribers.get(appId);
  if (subs) {
    for (const cb of subs) {
      cb(entry);
    }
  }

  // Also print to server console
  const prefix = `[App ${appId}]`;
  if (level === 'error') {
    console.error(prefix, message);
  } else {
    console.log(prefix, `[${level}]`, message);
  }
}

export function info(appId, msg) { log(appId, 'info', msg); }
export function success(appId, msg) { log(appId, 'success', msg); }
export function error(appId, msg) { log(appId, 'error', msg); }
export function warn(appId, msg) { log(appId, 'warn', msg); }
export function step(appId, msg) { log(appId, 'step', msg); }

export function getLogs(appId) {
  return appLogs.get(appId) || [];
}

export function clearLogs(appId) {
  appLogs.delete(appId);
}

export function subscribe(appId, callback) {
  if (!subscribers.has(appId)) {
    subscribers.set(appId, new Set());
  }
  subscribers.get(appId).add(callback);
  return () => {
    const subs = subscribers.get(appId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(appId);
    }
  };
}

