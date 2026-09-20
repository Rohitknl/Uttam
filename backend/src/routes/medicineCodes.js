import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireAdminOrViewer, requireHerbCodeCrudPassword } from '../middleware/auth.js';
import { validate, medicineCodeSchema, medicineCodeUpdateWriteSchema, medicineCodeDeleteSchema, recipeItemSchema } from '../validators/schemas.js';
import * as codeService from '../services/codeService.js';
import * as recipeService from '../services/recipeService.js';



const router = Router();



router.get('/', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {

  res.json(await codeService.getAllMedicineCodes(req.query.search));

}));



router.get('/available', authenticate, requireAdmin, asyncHandler(async (_req, res) => {

  res.json(await codeService.getAvailableMedicineCodes());

}));



router.get('/:id/recipe', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {
  res.json(await recipeService.getRecipeByMedicineCodeId(parseInt(req.params.id)));
}));

router.put('/:id/recipe', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const recipeUpdateSchema = z.object({
    formulaQuantity: z.number().positive().optional().default(1),
    formulaUnit: z.enum(['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES']).optional().default('PIECES'),
    items: z.array(recipeItemSchema),
  });
  const data = recipeUpdateSchema.parse(req.body);
  res.json(await recipeService.updateRecipeByMedicineCodeId(parseInt(req.params.id), data));
}));

router.get('/:id', authenticate, requireAdminOrViewer, asyncHandler(async (req, res) => {

  res.json(await codeService.getMedicineCodeById(parseInt(req.params.id)));

}));



router.post('/', authenticate, requireAdmin, validate(medicineCodeSchema), asyncHandler(async (req, res) => {

  res.status(201).json(await codeService.createMedicineCode(req.body));

}));



router.put('/:id', authenticate, requireAdmin, validate(medicineCodeUpdateWriteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {

  res.json(await codeService.updateMedicineCode(parseInt(req.params.id), req.body));

}));



router.delete('/:id', authenticate, requireAdmin, validate(medicineCodeDeleteSchema), requireHerbCodeCrudPassword, asyncHandler(async (req, res) => {

  await codeService.deleteMedicineCode(parseInt(req.params.id));

  res.status(204).send();

}));



export default router;

