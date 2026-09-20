import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireAdminOrViewer, requireHerbCodeCrudPassword } from '../middleware/auth.js';
import { validate, herbCodeSchema, herbCodeUpdateWriteSchema, herbCodeDeleteSchema } from '../validators/schemas.js';
import * as codeService from '../services/codeService.js';

const router = Router();

router.get('/', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await codeService.getAllHerbCodes(req.query.search));
}));

router.get('/available', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  res.json(await codeService.getAvailableHerbCodes(req.query.search));
}));

router.get('/:id', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await codeService.getHerbCodeById(parseInt(req.params.id)));
}));

router.post('/', authenticate, requireAdmin, validate(herbCodeSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await codeService.createHerbCode(req.body));
}));

router.put('/:id', authenticate, requireAdmin, validate(herbCodeUpdateWriteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  res.json(await codeService.updateHerbCode(parseInt(req.params.id), req.body));
}));

router.delete('/:id', authenticate, requireAdmin, validate(herbCodeDeleteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  await codeService.deleteHerbCode(parseInt(req.params.id));
  res.status(204).send();
}));

export default router;
