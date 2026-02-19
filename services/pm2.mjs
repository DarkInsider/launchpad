import pm2 from 'pm2';
import fs from 'fs';
import path from 'path';
import os from 'os';

function connect() {
  return new Promise((resolve, reject) => {
    pm2.connect(false, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function startApp({ name, script, cwd, env = {} }) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.start(
      {
        name,
        script,
        cwd,
        env,
        autorestart: true,
      },
      (err, proc) => {
        pm2.disconnect();
        if (err) return reject(err);
        resolve(proc);
      }
    );
  });
}

export async function stopApp(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.stop(name, (err, proc) => {
      pm2.disconnect();
      if (err) return reject(err);
      resolve(proc);
    });
  });
}

export async function restartApp(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.restart(name, (err, proc) => {
      pm2.disconnect();
      if (err) return reject(err);
      resolve(proc);
    });
  });
}

export async function deleteApp(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.delete(name, (err, proc) => {
      pm2.disconnect();
      if (err) return reject(err);
      resolve(proc);
    });
  });
}

export async function getStatus(name) {
  await connect();
  return new Promise((resolve, reject) => {
    pm2.describe(name, (err, desc) => {
      pm2.disconnect();
      if (err) return reject(err);
      if (!desc || desc.length === 0) {
        return resolve({ status: 'not_found' });
      }
      const proc = desc[0];
      resolve({
        status: proc.pm2_env?.status || 'unknown',
        cpu: proc.monit?.cpu || 0,
        memory: proc.monit?.memory || 0,
        uptime: proc.pm2_env?.pm_uptime || null,
        restarts: proc.pm2_env?.restart_time || 0,
        pid: proc.pid,
      });
    });
  });
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

