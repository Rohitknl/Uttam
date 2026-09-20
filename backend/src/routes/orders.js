import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, requireDealer } from '../middleware/auth.js';
import { validate, orderCreateSchema, orderRejectSchema } from '../validators/schemas.js';
import * as orderService from '../services/orderService.js';

const router = Router();
router.use(authenticate);

router.post('/', requireDealer, validate(orderCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await orderService.createOrder(req.user.userId, req.body));
}));

router.get('/mine', requireDealer, asyncHandler(async (req, res) => {
  res.json(await orderService.getDealerOrders(req.user.userId));
}));

router.get('/', requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await orderService.getAllOrders());
}));

router.post('/:id/approve', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await orderService.approveOrder(parseInt(req.params.id)));
}));

router.post('/:id/reject', requireAdmin, validate(orderRejectSchema), asyncHandler(async (req, res) => {
  res.json(await orderService.rejectOrder(parseInt(req.params.id), req.body.reason));
}));

router.post('/:id/dispatch', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await orderService.dispatchOrder(parseInt(req.params.id)));
}));

export default router;
