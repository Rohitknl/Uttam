import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireHerbCodeCrudPassword } from '../middleware/auth.js';
import { validate, medicineSchema, medicineUpdateWriteSchema, medicineDeleteSchema } from '../validators/schemas.js';
import * as medicineService from '../services/medicineService.js';

const router = Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const isDealer = req.user.role === 'ROLE_DEALER';
  const activeOnly = req.query.activeOnly === 'true';
  res.json(await medicineService.getAllMedicines(req.query.search, activeOnly, isDealer));
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  res.json(await medicineService.getMedicineById(parseInt(req.params.id)));
}));

router.post('/', authenticate, requireAdmin, validate(medicineSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await medicineService.createMedicine(req.body));
}));

router.put('/:id', authenticate, requireAdmin, validate(medicineUpdateWriteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  res.json(await medicineService.updateMedicine(parseInt(req.params.id), req.body));
}));

router.delete('/:id', authenticate, requireAdmin, validate(medicineDeleteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {
  await medicineService.deleteMedicine(parseInt(req.params.id));
  res.status(204).send();
}));

export default router;
