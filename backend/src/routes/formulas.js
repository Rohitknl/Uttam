import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  validate,
  formulaValidateSchema,
  formulaGenerateSchema,
  formulaSaveSchema,
  formulaConsumeSchema,
} from '../validators/schemas.js';
import * as formulaService from '../services/formulaService.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.post('/validate', validate(formulaValidateSchema), asyncHandler(async (req, res) => {
  res.json(await formulaService.validateFormula(req.body.medicineCodeId, req.body.batchSize));
}));

router.post('/generate', validate(formulaGenerateSchema), asyncHandler(async (req, res) => {
  res.json(await formulaService.generateFormula(req.body.medicineCodeId, req.body.batchSize));
}));

router.post('/save', validate(formulaSaveSchema), asyncHandler(async (req, res) => {
  res.json(await formulaService.saveFormula(req.body.medicineCodeId, req.body.batchSize, req.body.items));
}));

router.post('/consume', validate(formulaConsumeSchema), asyncHandler(async (req, res) => {
  res.json(await formulaService.consumeFormula(req.body.medicineCodeId, req.body.batchSize));
}));

export default router;
