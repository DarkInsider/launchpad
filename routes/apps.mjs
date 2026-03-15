import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import db from '../db/index.mjs';
import * as pm2Service from '../services/pm2.mjs';
import * as gitService from '../services/git.mjs';
import * as logger from '../services/logger.mjs';

const router = Router();

// Helper: slugify name for pm2
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Helper: exec as promise with live logging
function execWithLogs(command, options, appId) {
  return new Promise((resolve, reject) => {
    logger.info(appId, `$ ${command}`);
    const child = exec(command, options);

    child.stdout?.on('data', (data) => {
      const lines = data.toString().trim();
      if (lines) logger.info(appId, lines);
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().trim();
      if (lines) logger.warn(appId, lines);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// =====================
// SSE: stream deploy logs in real-time
// =====================
router.get('/:id/events', (req, res) => {
  const appId = req.params.id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send existing logs first
  const existing = logger.getLogs(appId);
  for (const entry of existing) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  // Subscribe to new logs
  const unsubscribe = logger.subscribe(appId, (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// =====================
// GET deploy logs (non-SSE, for polling fallback)
// =====================
router.get('/:id/deploy-logs', async (req, res) => {
  try {
    const logs = logger.getLogs(req.params.id);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// GET /api/apps — list all apps
// =====================
router.get('/', async (req, res) => {
  try {
    const apps = await db('apps').select('*').orderBy('created_at', 'desc');
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// POST /api/apps — create a new app
// =====================
router.post('/', async (req, res) => {
  try {
    const { name, repo_url, env_vars, build_command, start_command } = req.body;

    if (!name || !repo_url || !start_command) {
      return res.status(400).json({ error: 'name, repo_url, and start_command are required' });
    }

    const pm2_name = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

    const [id] = await db('apps').insert({
      name,
      repo_url,
      env_vars: JSON.stringify(env_vars || {}),
      build_command: build_command || '',
      start_command,
      pm2_name,
      status: 'stopped',
    });

    const app = await db('apps').where({ id }).first();

    logger.success(id, `Приложение "${name}" создано (pm2: ${pm2_name})`);

    res.status(201).json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// GET /api/apps/:id — get single app with live status
// =====================
router.get('/:id', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    let pm2Status = { status: 'not_found' };
    try {
      pm2Status = await pm2Service.getStatus(app.pm2_name);
    } catch {
      // PM2 process doesn't exist yet
    }

    res.json({ ...app, pm2: pm2Status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// PUT /api/apps/:id — update app
// =====================
router.put('/:id', async (req, res) => {
  try {
    const { name, repo_url, env_vars, build_command, start_command } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (repo_url !== undefined) updates.repo_url = repo_url;
    if (env_vars !== undefined) updates.env_vars = JSON.stringify(env_vars);
    if (build_command !== undefined) updates.build_command = build_command;
    if (start_command !== undefined) updates.start_command = start_command;
    updates.updated_at = db.fn.now();

    await db('apps').where({ id: req.params.id }).update(updates);
    const app = await db('apps').where({ id: req.params.id }).first();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// DELETE /api/apps/:id
// =====================
router.delete('/:id', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    logger.step(app.id, 'Удаление приложения...');

    try {
      await pm2Service.deleteApp(app.pm2_name);
      logger.info(app.id, 'PM2 процесс удалён');
    } catch {
      logger.warn(app.id, 'PM2 процесс не найден (возможно, не был запущен)');
    }

    await db('apps').where({ id: req.params.id }).del();
    logger.success(app.id, 'Приложение удалено из базы данных');

    // Remove cloned repo directory
    const repoDir = gitService.getRepoDir(app.pm2_name);
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      logger.info(app.id, `Директория репозитория удалена: ${repoDir}`);
    } catch {
      logger.warn(app.id, `Не удалось удалить директорию: ${repoDir}`);
    }

    logger.clearLogs(app.id);

    res.json({ success: true });
  } catch (err) {
    logger.error(req.params.id, `Ошибка удаления: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// POST /api/apps/:id/start — clone repo, run build, start via PM2
// =====================
router.post('/:id/start', async (req, res) => {
  const appId = req.params.id;
  try {
    const app = await db('apps').where({ id: appId }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    // 1. Clone or pull repo
    logger.step(appId, `📦 Клонирование репозитория: ${app.repo_url}`);
    let repoDir;
    try {
      repoDir = await gitService.cloneOrPull(app.repo_url, app.pm2_name);
      logger.success(appId, `Репозиторий готов: ${repoDir}`);
    } catch (err) {
      logger.error(appId, `Ошибка клонирования: ${err.message}`);
      throw err;
    }

    // 2. Parse env vars
    let envVars = {};
    try {
      envVars = JSON.parse(app.env_vars || '{}');
    } catch {
      logger.warn(appId, 'Не удалось распарсить env_vars, используем пустой объект');
    }
    const envKeys = Object.keys(envVars);
    if (envKeys.length > 0) {
      logger.info(appId, `Переменные окружения: ${envKeys.join(', ')}`);
    }

    // 3. Run build command if present
    if (app.build_command && app.build_command.trim()) {
      logger.step(appId, `🔨 Выполняем команду сборки: ${app.build_command}`);
      try {
        await execWithLogs(app.build_command, {
          cwd: repoDir,
          env: { ...process.env, ...envVars },
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }, appId);
        logger.success(appId, 'Сборка завершена успешно');
      } catch (err) {
        logger.error(appId, `Ошибка сборки: ${err.message}`);
        throw err;
      }
    }

    // 4. Start via PM2
    logger.step(appId, `🚀 Запускаем через PM2: ${app.start_command}`);
    try {
      await pm2Service.startApp({
        name: app.pm2_name,
        script: app.start_command,
        cwd: repoDir,
        env: envVars,
      });
      logger.success(appId, `PM2 процесс "${app.pm2_name}" запущен`);
    } catch (err) {
      logger.error(appId, `Ошибка запуска PM2: ${err.message}`);
      throw err;
    }

    // 5. Update status in DB
    await db('apps').where({ id: app.id }).update({ status: 'running', updated_at: db.fn.now() });
    logger.success(appId, '✅ Приложение успешно запущено!');

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    await db('apps').where({ id: appId }).update({ status: 'errored', updated_at: db.fn.now() }).catch(() => {});
    logger.error(appId, `❌ Запуск не удался: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// POST /api/apps/:id/redeploy — stop, pull latest, rebuild, start
// =====================
router.post('/:id/redeploy', async (req, res) => {
  const appId = req.params.id;
  try {
    const app = await db('apps').where({ id: appId }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    // 1. Stop existing PM2 process (if running)
    logger.step(appId, '🔁 Редеплой: остановка текущего процесса...');
    try {
      await pm2Service.deleteApp(app.pm2_name);
      logger.info(appId, 'PM2 процесс остановлен и удалён');
    } catch {
      logger.warn(appId, 'PM2 процесс не найден (возможно, не был запущен)');
    }

    // 2. Pull latest code
    logger.step(appId, `📦 Обновление репозитория: ${app.repo_url}`);
    let repoDir;
    try {
      repoDir = await gitService.cloneOrPull(app.repo_url, app.pm2_name);
      logger.success(appId, `Репозиторий обновлён: ${repoDir}`);
    } catch (err) {
      logger.error(appId, `Ошибка обновления репозитория: ${err.message}`);
      throw err;
    }

    // 3. Parse env vars
    let envVars = {};
    try {
      envVars = JSON.parse(app.env_vars || '{}');
    } catch {
      logger.warn(appId, 'Не удалось распарсить env_vars, используем пустой объект');
    }

    // 4. Run build command if present
    if (app.build_command && app.build_command.trim()) {
      logger.step(appId, `🔨 Выполняем команду сборки: ${app.build_command}`);
      try {
        await execWithLogs(app.build_command, {
          cwd: repoDir,
          env: { ...process.env, ...envVars },
          maxBuffer: 10 * 1024 * 1024,
        }, appId);
        logger.success(appId, 'Сборка завершена успешно');
      } catch (err) {
        logger.error(appId, `Ошибка сборки: ${err.message}`);
        throw err;
      }
    }

    // 5. Start via PM2
    logger.step(appId, `🚀 Запускаем через PM2: ${app.start_command}`);
    try {
      await pm2Service.startApp({
        name: app.pm2_name,
        script: app.start_command,
        cwd: repoDir,
        env: envVars,
      });
      logger.success(appId, `PM2 процесс "${app.pm2_name}" запущен`);
    } catch (err) {
      logger.error(appId, `Ошибка запуска PM2: ${err.message}`);
      throw err;
    }

    // 6. Update status in DB
    await db('apps').where({ id: app.id }).update({ status: 'running', updated_at: db.fn.now() });
    logger.success(appId, '✅ Редеплой завершён успешно!');

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    await db('apps').where({ id: appId }).update({ status: 'errored', updated_at: db.fn.now() }).catch(() => {});
    logger.error(appId, `❌ Редеплой не удался: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// POST /api/apps/:id/stop
// =====================
router.post('/:id/stop', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    logger.step(app.id, '⏹ Остановка приложения...');
    await pm2Service.stopApp(app.pm2_name);
    await db('apps').where({ id: app.id }).update({ status: 'stopped', updated_at: db.fn.now() });
    logger.success(app.id, 'Приложение остановлено');

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    logger.error(req.params.id, `Ошибка остановки: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// POST /api/apps/:id/restart
// =====================
router.post('/:id/restart', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    logger.step(app.id, '🔄 Перезапуск приложения...');
    await pm2Service.restartApp(app.pm2_name);
    await db('apps').where({ id: app.id }).update({ status: 'running', updated_at: db.fn.now() });
    logger.success(app.id, 'Приложение перезапущено');

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    logger.error(req.params.id, `Ошибка перезапуска: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// GET /api/apps/:id/status — live PM2 status
// =====================
router.get('/:id/status', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    const status = await pm2Service.getStatus(app.pm2_name);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// GET /api/apps/:id/logs — get recent PM2 process logs
// =====================
router.get('/:id/logs', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    const lines = parseInt(req.query.lines) || 100;
    const logs = await pm2Service.getLogs(app.pm2_name, lines);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

