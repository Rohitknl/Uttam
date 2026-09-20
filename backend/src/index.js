import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import { initCredentials } from './utils/credentialsFile.js';
import herbCodeRoutes from './routes/herbCodes.js';
import medicineCodeRoutes from './routes/medicineCodes.js';
import herbRoutes from './routes/herbs.js';
import billRoutes from './routes/bills.js';
import medicineRoutes from './routes/medicines.js';
import formulaRoutes from './routes/formulas.js';
import productionRoutes from './routes/production.js';
import orderRoutes from './routes/orders.js';
import inventoryRoutes from './routes/inventory.js';
import analyticsRoutes from './routes/analytics.js';
import backupRoutes from './routes/backup.js';
import settingsRoutes from './routes/settings.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin) return callback(null, true);

    // Reflect origin to satisfy credentials: true for any requested origin or wildcard *
    if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      return callback(null, origin);
    }

    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

app.options('*', cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/herb-codes', herbCodeRoutes);
app.use('/api/medicine-codes', medicineCodeRoutes);
app.use('/api/herbs', herbRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/formulas', formulaRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/settings', settingsRoutes);

if (config.staticDir) {
  const staticDir = path.resolve(config.staticDir);
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use(errorHandler);

// Ensure credentials.json exists before accepting requests
await initCredentials();

const host = config.host;
app.listen(config.port, host, () => {
  console.log(`Uttam Laboratories API running on http://${host}:${config.port}`);
});

export default app;
