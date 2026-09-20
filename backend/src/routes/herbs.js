import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireAdminOrViewer, requireHerbCodeCrudPassword } from '../middleware/auth.js';
import { validate, herbSchema, herbUpdateWriteSchema, herbDeleteSchema } from '../validators/schemas.js';
import * as herbService from '../services/herbService.js';

const router = Router();

router.get('/', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await herbService.getAllHerbs(req.query.search));
}));

router.post('/from-code', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const herbCodeId = parseInt(req.body?.herbCodeId, 10);
  if (!Number.isInteger(herbCodeId)) {
    res.status(400).json({ message: 'herbCodeId is required' });
    return;
  }
  res.status(201).json(await herbService.ensureHerbFromCode(herbCodeId));
}));

router.get('/:id', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await herbService.getHerbById(parseInt(req.params.id)));
}));

router.post('/', authenticate, requireAdmin, validate(herbSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await herbService.createHerb(req.body));
}));

router.put('/:id', authenticate, requireAdmin, validate(herbUpdateWriteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  res.json(await herbService.updateHerb(parseInt(req.params.id), req.body));
}));

router.delete('/:id', authenticate, requireAdmin, validate(herbDeleteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  await herbService.deleteHerb(parseInt(req.params.id));
  res.status(204).send();
}));

export default router;
