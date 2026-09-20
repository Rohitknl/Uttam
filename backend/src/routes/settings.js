import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import * as settingsService from '../services/settingsService.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/security', asyncHandler(async (_req, res) => {
  res.json(await settingsService.getSecurityStatus());
}));

router.post('/crud-password', asyncHandler(async (req, res) => {
  res.json(await settingsService.setCrudPassword(req.user.userId, req.body || {}));
}));

export default router;
