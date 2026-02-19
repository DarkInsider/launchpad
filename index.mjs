import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db/index.mjs';
import appsRouter from './routes/apps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/apps', appsRouter);

// Serve React frontend in production
const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Run migrations and start server
async function start() {
  try {
    await db.migrate.latest();
    console.log('✅ Database migrations applied');
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Launchpad server running on http://localhost:${PORT}`);
  });
}

start();
