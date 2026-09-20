import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, toMoney, multiply, subtract, add } from '../utils/decimal.js';
import { generateOrderNumber } from '../utils/numbers.js';

function formatOrderItem(item) {
  return {
    id: item.id,
    orderId: item.orderId,
    medicineId: item.medicineId,
    medicineName: item.medicine?.name,
    quantity: toNumber(item.quantity),
    unitPrice: toMoney(item.unitPrice),
    lineTotal: toMoney(item.lineTotal),
  };
}

function formatOrder(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    dealerId: order.dealerId,
    dealerName: order.dealer?.fullName,
    status: order.status,
    totalAmount: toMoney(order.totalAmount),
    notes: order.notes,
    rejectReason: order.rejectReason,
    approvedAt: order.approvedAt,
    dispatchedAt: order.dispatchedAt,
    items: order.items?.map(formatOrderItem) || [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function createOrder(dealerId, data) {
  const orderNumber = generateOrderNumber();
  let totalAmount = 0;
  const processedItems = [];

  for (const item of data.items) {
    const medicine = await prisma.medicine.findUnique({ where: { id: item.medicineId } });
    if (!medicine || !medicine.active) {
      throw new AppError(`Medicine ${item.medicineId} not found or inactive`, 400);
    }
    const unitPrice = toMoney(medicine.pricePerUnit);
    const lineTotal = toMoney(multiply(unitPrice, item.quantity));
    totalAmount = toMoney(add(totalAmount, lineTotal));
    processedItems.push({ ...item, unitPrice, lineTotal });
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        dealerId,
        status: 'PENDING',
        totalAmount,
        notes: data.notes,
      },
    });

    for (const item of processedItems) {
      await tx.orderItem.create({
        data: {
          orderId: created.id,
          medicineId: item.medicineId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        },
      });
    }

    return tx.order.findUnique({
      where: { id: created.id },
      include: { dealer: true, items: { include: { medicine: true } } },
    });
  });

  return formatOrder(order);
}

export async function getAllOrders() {
  const orders = await prisma.order.findMany({
    include: { dealer: true, items: { include: { medicine: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map(formatOrder);
}

export async function getDealerOrders(dealerId) {
  const orders = await prisma.order.findMany({
    where: { dealerId },
    include: { dealer: true, items: { include: { medicine: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map(formatOrder);
}

async function deductOrderStock(order, tx) {
  for (const item of order.items) {
    const medicine = await tx.medicine.findUnique({ where: { id: item.medicineId } });
    const newStock = subtract(medicine.currentStock, item.quantity);
    if (toNumber(newStock) < 0) {
      throw new AppError(`Insufficient stock for ${medicine.name}`, 400);
    }
    await tx.medicine.update({
      where: { id: item.medicineId },
      data: { currentStock: toNumber(newStock) },
    });
  }
}

export async function approveOrder(id) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { medicine: true } }, dealer: true },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status !== 'PENDING') {
    throw new AppError('Order is not pending', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await deductOrderStock(order, tx);
    return tx.order.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: { dealer: true, items: { include: { medicine: true } } },
    });
  });

  return formatOrder(updated);
}

export async function rejectOrder(id, reason) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status !== 'PENDING') {
    throw new AppError('Order is not pending', 400);
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'REJECTED', rejectReason: reason },
    include: { dealer: true, items: { include: { medicine: true } } },
  });
  return formatOrder(updated);
}

export async function dispatchOrder(id) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { medicine: true } }, dealer: true },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'REJECTED') {
    throw new AppError('Cannot dispatch a rejected order', 400);
  }
  if (order.status === 'DISPATCHED') {
    throw new AppError('Order is already dispatched', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (order.status === 'PENDING') {
      await deductOrderStock(order, tx);
    }
    return tx.order.update({
      where: { id },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      include: { dealer: true, items: { include: { medicine: true } } },
    });
  });

  return formatOrder(updated);
}
