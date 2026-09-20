import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate, productionStartSchema, productionCompleteSchema } from '../validators/schemas.js';
import * as productionService from '../services/productionService.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await productionService.getAllProduction());
}));

router.get('/preview', asyncHandler(async (req, res) => {
  const medicineId = parseInt(req.query.medicineId);
  const quantity = parseFloat(req.query.quantity);
  res.json(await productionService.previewProduction(medicineId, quantity));
}));

router.post('/preview', validate(productionStartSchema), asyncHandler(async (req, res) => {
  res.json(await productionService.previewProduction(req.body.medicineId, req.body.quantity));
}));

router.post('/', validate(productionStartSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await productionService.startProduction(req.body.medicineId, req.body.quantity));
}));

router.post('/:id/complete', validate(productionCompleteSchema), asyncHandler(async (req, res) => {
  res.json(await productionService.completeProduction(parseInt(req.params.id), req.body));
}));

export default router;
