import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdminOrViewer } from '../middleware/auth.js';
import * as analyticsService from '../services/analyticsService.js';

const router = Router();

router.get('/query', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await analyticsService.queryInventory(
    req.query.supplierSearch,
    req.query.fromDate,
    req.query.toDate,
  ));
}));

export default router;
