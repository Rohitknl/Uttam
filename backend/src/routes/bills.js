import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate, billCreateSchema, billUpdateSchema, billLineUpdateSchema } from '../validators/schemas.js';
import * as billService from '../services/billService.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await billService.getAllBills(req.query.search));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await billService.getBillById(parseInt(req.params.id)));
}));

router.post('/', validate(billCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await billService.createBill(req.body));
}));

router.put('/:id', validate(billUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await billService.updateBill(parseInt(req.params.id), req.body));
}));

router.put('/:billId/lines/:lineId', validate(billLineUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await billService.updateBillLine(
    parseInt(req.params.billId),
    parseInt(req.params.lineId),
    req.body,
  ));
}));

router.delete('/:billId/lines/:lineId', asyncHandler(async (req, res) => {
  await billService.deleteBillLine(parseInt(req.params.billId), parseInt(req.params.lineId));
  res.status(204).send();
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await billService.deleteBill(parseInt(req.params.id));
  res.status(204).send();
}));

export default router;
