// api/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');

const designFilesRouter = require('./routes/designFiles');
const outputFlowsRouter = require('./routes/outputFlows');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors({
  origin: [
    'http://localhost:3000',   // Next.js dev server
    'http://localhost:3002',   // alternate Next.js port
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));   // allow large JSON payloads

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── Routes ──
app.use('/api/design-files', designFilesRouter);
app.use('/api/output-flows', outputFlowsRouter);

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server + seed bucket ──
app.listen(PORT, async () => {
  console.log(`\n🚀  API server running on http://localhost:${PORT}`);
  console.log(`📋  Health check: http://localhost:${PORT}/health\n`);

  // Run seed script on startup in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🌱  Running bucket seed...');
    try {
      require('./scripts/seedBucket');
    } catch (err) {
      console.warn('⚠️  Seed failed (bucket may already exist):', err.message);
    }
  }
});