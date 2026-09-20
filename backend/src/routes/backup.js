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
  res.json(backupService.listBackups(req.query.destinationId || 'c_uttam'));
}));

router.post('/create', requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  const destinationId = req.body?.destinationId || 'c_uttam';
  res.status(201).json(await backupService.createBackup(destinationId));
}));

router.post('/restore', requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  const { destinationId, fileName } = req.body || {};
  res.json(await backupService.restoreBackup(destinationId || 'c_uttam', fileName));
}));

export default router;
