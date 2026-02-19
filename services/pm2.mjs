import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Resolve PM2 binary path (use the local one from node_modules)
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PM2_BIN = path.resolve(__dirname, '..', 'node_modules', '.bin', 'pm2');

export async function startApp({ name, script, cwd, env = {} }) {
  // Delete existing process with same name (ignore errors)
  try {
    await execAsync(`"${PM2_BIN}" delete "${name}"`, { cwd });
  } catch {
    // ignore — process may not exist
  }

  // Use PM2 CLI to start — much more reliable than programmatic API
  // For shell commands like "npm run start", we use: pm2 start npm --name "x" -- run start
  // For direct scripts like "node index.js", we use: pm2 start index.js --name "x"
  const parts = script.trim().split(/\s+/);
  let pm2Cmd;

  if (parts[0] === 'npm') {
    // npm start, npm run start, npm run dev, etc.
    const npmArgs = parts.slice(1).join(' ');
    pm2Cmd = `"${PM2_BIN}" start npm --name "${name}" --no-autorestart -- ${npmArgs}`;
  } else if (parts[0] === 'node') {
    // node index.js, node server.js, etc.
    const nodeArgs = parts.slice(1).join(' ');
    pm2Cmd = `"${PM2_BIN}" start ${nodeArgs} --name "${name}"`;
  } else {
    // Generic command — wrap in bash -c
    pm2Cmd = `"${PM2_BIN}" start bash --name "${name}" --no-autorestart -- -c "${script.replace(/"/g, '\\"')}"`;
  }

  const { stdout, stderr } = await execAsync(pm2Cmd, {
    cwd,
    env: { ...process.env, ...env },
    timeout: 30000,
  });

  return { stdout, stderr };
}

export async function stopApp(name) {
  const { stdout } = await execAsync(`"${PM2_BIN}" stop "${name}"`, { timeout: 15000 });
  return stdout;
}

export async function restartApp(name) {
  const { stdout } = await execAsync(`"${PM2_BIN}" restart "${name}"`, { timeout: 15000 });
  return stdout;
}

export async function deleteApp(name) {
  const { stdout } = await execAsync(`"${PM2_BIN}" delete "${name}"`, { timeout: 15000 });
  return stdout;
}

export async function getStatus(name) {
  try {
    const { stdout } = await execAsync(`"${PM2_BIN}" jlist`, { timeout: 10000 });
    const list = JSON.parse(stdout);
    const proc = list.find((p) => p.name === name);

    if (!proc) {
      return { status: 'not_found' };
    }

    return {
      status: proc.pm2_env?.status || 'unknown',
      cpu: proc.monit?.cpu || 0,
      memory: proc.monit?.memory || 0,
      uptime: proc.pm2_env?.pm_uptime || null,
      restarts: proc.pm2_env?.restart_time || 0,
      pid: proc.pid,
    };
  } catch {
    return { status: 'not_found' };
  }
}

export async function getLogs(name, lines = 100) {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
  const outLogPath = path.join(pm2Home, 'logs', `${name}-out.log`);
  const errLogPath = path.join(pm2Home, 'logs', `${name}-error.log`);

  let outLog = '';
  let errLog = '';

  try {
    if (fs.existsSync(outLogPath)) {
      const content = fs.readFileSync(outLogPath, 'utf-8');
      const allLines = content.trim().split('\n');
      outLog = allLines.slice(-lines).join('\n');
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(errLogPath)) {
      const content = fs.readFileSync(errLogPath, 'utf-8');
      const allLines = content.trim().split('\n');
      errLog = allLines.slice(-lines).join('\n');
    }
  } catch {
    // ignore
  }

  return { out: outLog, err: errLog };
}

