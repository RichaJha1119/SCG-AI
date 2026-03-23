import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './services/dbService.js';
import generateRoutes from './routes/generate.js';
import componentsRoutes from './routes/components.js';
import salesforceRoutes from './routes/salesforce.js';
import deployRoutes from './routes/deploy.js';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/generate', generateRoutes);
app.use('/api/components', componentsRoutes);
app.use('/api/salesforce', salesforceRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/auth', authRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled Express error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// Keep the dev server alive on unexpected promise/runtime failures so
// one bad request does not kill all subsequent API calls.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

async function start() {
  try {
    await initDB();
    console.log('✓ Database initialized');
    app.listen(PORT, () => {
      console.log(`✓ SCG-AI Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
