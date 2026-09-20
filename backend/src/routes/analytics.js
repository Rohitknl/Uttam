import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireAdminOrViewer, requireDealer } from '../middleware/auth.js';
import * as analyticsService from '../services/analyticsService.js';

const router = Router();

router.get('/admin', authenticate, requireAdminOrViewer, asyncHandler(async (_req, res) => {
  res.json(await analyticsService.getAdminAnalytics());
}));

router.get('/dealer', authenticate, requireDealer, asyncHandler(async (req, res) => {
  res.json(await analyticsService.getDealerAnalytics(req.user.userId));
}));

export default router;
