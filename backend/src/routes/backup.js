import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireHerbCodeCrudPassword } from '../middleware/auth.js';
import * as backupService from '../services/backupService.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/destinations', asyncHandler(async (_req, res) => {
  res.json(backupService.getBackupDestinations());
}));

router.get('/list', asyncHandler(async (req, res) => {
  // destinationId is required — front-end always sends it after loading destinations
  const { destinationId } = req.query;
  if (!destinationId) {
    return res.status(400).json({ message: 'destinationId query param is required' });
  }
  res.json(backupService.listBackups(destinationId));
}));

router.post('/create', requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  const { destinationId } = req.body || {};
  if (!destinationId) {
    return res.status(400).json({ message: 'destinationId is required' });
  }
  res.status(201).json(await backupService.createBackup(destinationId));
}));

router.post('/restore', requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  const { destinationId, fileName } = req.body || {};
  if (!destinationId) {
    return res.status(400).json({ message: 'destinationId is required' });
  }
  res.json(await backupService.restoreBackup(destinationId, fileName));
}));

export default router;
