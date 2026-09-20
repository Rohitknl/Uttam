import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, toMoney, multiply, subtract, add } from '../utils/decimal.js';
import { generateProductionNumber } from '../utils/numbers.js';
import { previewProduction } from './formulaService.js';

function formatProductionBatch(batch) {
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    medicineId: batch.medicineId,
    medicineName: batch.medicine?.name,
    quantity: toNumber(batch.quantity),
    status: batch.status,
    batchNumber2: batch.batchNumber2,
    expiryDate: batch.expiryDate,
    stockLocation: batch.stockLocation,
    rackCode: batch.rackCode,
    pricePerUnit: batch.pricePerUnit ? toMoney(batch.pricePerUnit) : null,
    minStockAlert: batch.minStockAlert ? toNumber(batch.minStockAlert) : null,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

export async function getAllProduction() {
  const batches = await prisma.productionBatch.findMany({
    include: { medicine: true },
    orderBy: { createdAt: 'desc' },
  });
  return batches.map(formatProductionBatch);
}

export async function startProduction(medicineId, quantity) {
  const preview = await previewProduction(medicineId, quantity);
  if (!preview.sufficient) {
    throw new AppError('Insufficient herb stock for production', 400);
  }
  if (preview.requirements.length === 0) {
    throw new AppError('No formula defined for this medicine', 400);
  }

  const batchNumber = generateProductionNumber();
  const batch = await prisma.productionBatch.create({
    data: {
      batchNumber,
      medicineId,
      quantity,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
    include: { medicine: true },
  });
  return formatProductionBatch(batch);
}

export async function completeProduction(id, data) {
  const batch = await prisma.productionBatch.findUnique({
    where: { id },
    include: { medicine: true },
  });
  if (!batch) throw new AppError('Production batch not found', 404);
  if (batch.status !== 'IN_PROGRESS') {
    throw new AppError('Production batch is not in progress', 400);
  }

  const preview = await previewProduction(batch.medicineId, toNumber(batch.quantity));
  if (!preview.sufficient) {
    throw new AppError('Insufficient herb stock to complete production', 400);
  }

  return prisma.$transaction(async (tx) => {
    for (const req of preview.requirements) {
      const herb = await tx.herb.findUnique({ where: { id: req.herbId } });
      const newStock = subtract(herb.currentStock, req.requiredQuantity);
      await tx.herb.update({
        where: { id: req.herbId },
        data: { currentStock: toNumber(newStock) },
      });
    }

    const medicine = await tx.medicine.findUnique({ where: { id: batch.medicineId } });
    const newStock = add(medicine.currentStock, batch.quantity);

    await tx.medicine.update({
      where: { id: batch.medicineId },
      data: {
        currentStock: toNumber(newStock),
        batchNumber: data.batchNumber,
        expiryDate: new Date(data.expiryDate),
        stockLocation: data.stockLocation,
        rackCode: data.rackCode,
        pricePerUnit: data.pricePerUnit,
        minimumStockAlert: data.minimumStockAlert || 0,
      },
    });

    await tx.batch.create({
      data: {
        batchNumber: data.batchNumber,
        type: 'MEDICINE',
        medicineId: batch.medicineId,
        quantity: batch.quantity,
        expiryDate: new Date(data.expiryDate),
        location: data.stockLocation,
        rackCode: data.rackCode,
        pricePerUnit: data.pricePerUnit,
      },
    });

    const updated = await tx.productionBatch.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        batchNumber2: data.batchNumber,
        expiryDate: new Date(data.expiryDate),
        stockLocation: data.stockLocation,
        rackCode: data.rackCode,
        pricePerUnit: data.pricePerUnit,
        minStockAlert: data.minimumStockAlert || 0,
        completedAt: new Date(),
      },
      include: { medicine: true },
    });

    return formatProductionBatch(updated);
  });
}

export { previewProduction };
