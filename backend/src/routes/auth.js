/**
 * auth.js — simplified auth routes.
 *
 * Routes:
 *   POST /api/auth/login            — login with username + password
 *   GET  /api/auth/me               — get current user profile (requires token)
 *   POST /api/auth/change-password  — change own password (requires token)
 *   PUT  /api/auth/me               — update display name (requires token)
 *
 * Removed: OTP flows, forgot-password, multi-user /api/users management.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate, loginSchema } from '../validators/schemas.js';
import * as authService from '../services/authService.js';

const router = Router();

// Public — no token required
router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.username, req.body.password);
  res.json(result);
}));

// Protected — token required
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.userId);
  res.json(user);
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  res.json(await authService.changeOwnPassword(req.user.userId, req.body || {}));
}));

router.put('/me', authenticate, asyncHandler(async (req, res) => {
  res.json(await authService.updateOwnProfile(req.user.userId, req.body || {}));
}));

export default router;
