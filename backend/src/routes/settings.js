import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireAdminOrViewer } from '../middleware/auth.js';
import * as settingsService from '../services/settingsService.js';

const router = Router();

router.get('/security', authenticate, requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await settingsService.getSecurityStatus());
}));

router.post('/crud-password', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await settingsService.setCrudPassword(req.user.userId, req.body || {}));
}));

router.post('/verify-category-password', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  const { category, password } = req.body || {};
  if (!password) {
    throw new AppError('Password is required', 400);
  }
  const valid = await settingsService.verifyCategoryPassword(category, password);
  if (!valid) {
    throw new AppError('Invalid password', 403);
  }
  res.json({ success: true, category });
}));

router.get('/category-passwords', authenticate, requireAdminOrViewer, asyncHandler(async (_req, res) => {
  res.json(await settingsService.getCategoryPasswordStatus());
}));

router.post('/category-password', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await settingsService.setCategoryPassword(req.user.userId, req.body || {}));
}));

export default router;
