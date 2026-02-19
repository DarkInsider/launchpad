import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import db from '../db/index.mjs';
import * as pm2Service from '../services/pm2.mjs';
import * as gitService from '../services/git.mjs';

const execAsync = promisify(exec);
const router = Router();

// Helper: slugify name for pm2
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// GET /api/apps — list all apps
router.get('/', async (req, res) => {
  try {
    const apps = await db('apps').select('*').orderBy('created_at', 'desc');
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apps — create a new app
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
    res.status(201).json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/apps/:id — get single app with live status
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

// PUT /api/apps/:id — update app
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

// DELETE /api/apps/:id — delete app (stop PM2 + remove from DB)
router.delete('/:id', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    // Try to stop/delete from PM2
    try {
      await pm2Service.deleteApp(app.pm2_name);
    } catch {
      // ignore — maybe never started
    }

    await db('apps').where({ id: req.params.id }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apps/:id/start — clone repo, run build, start via PM2
router.post('/:id/start', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    // 1. Clone or pull repo
    const repoDir = await gitService.cloneOrPull(app.repo_url, app.pm2_name);

    // 2. Parse env vars
    let envVars = {};
    try {
      envVars = JSON.parse(app.env_vars || '{}');
    } catch {
      // ignore
    }

    // 3. Run build command if present
    if (app.build_command && app.build_command.trim()) {
      await execAsync(app.build_command, {
        cwd: repoDir,
        env: { ...process.env, ...envVars },
      });
    }

    // 4. Start via PM2
    await pm2Service.startApp({
      name: app.pm2_name,
      script: app.start_command,
      cwd: repoDir,
      env: envVars,
    });

    // 5. Update status in DB
    await db('apps').where({ id: app.id }).update({ status: 'running', updated_at: db.fn.now() });

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    // Mark as errored
    await db('apps').where({ id: req.params.id }).update({ status: 'errored', updated_at: db.fn.now() });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apps/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    await pm2Service.stopApp(app.pm2_name);
    await db('apps').where({ id: app.id }).update({ status: 'stopped', updated_at: db.fn.now() });

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apps/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    const app = await db('apps').where({ id: req.params.id }).first();
    if (!app) return res.status(404).json({ error: 'App not found' });

    await pm2Service.restartApp(app.pm2_name);
    await db('apps').where({ id: app.id }).update({ status: 'running', updated_at: db.fn.now() });

    const updated = await db('apps').where({ id: app.id }).first();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/apps/:id/status — live PM2 status
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

// GET /api/apps/:id/logs — get recent logs
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

