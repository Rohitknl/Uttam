import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, toMoney } from '../utils/decimal.js';

function formatMedicine(med) {
  return {
    id: med.id,
    name: med.name,
    medicineCodeId: med.medicineCodeId,
    medicineCode: med.medicineCode?.code || null,
    type: med.type,
    unit: med.unit,
    category: med.category,
    description: med.description,
    batchNumber: med.batchNumber,
    expiryDate: med.expiryDate,
    stockLocation: med.stockLocation,
    rackCode: med.rackCode,
    pricePerUnit: toMoney(med.pricePerUnit),
    currentStock: toNumber(med.currentStock),
    minimumStockAlert: toNumber(med.minimumStockAlert),
    active: med.active,
    createdAt: med.createdAt,
    updatedAt: med.updatedAt,
  };
}

export async function getAllMedicines(search, activeOnly, isDealer) {
  const where = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { medicineCode: { code: { contains: search } } },
      { stockLocation: { contains: search } },
      { rackCode: { contains: search } },
    ];
  }
  if (activeOnly || isDealer) {
    where.active = true;
  }
  const medicines = await prisma.medicine.findMany({
    where,
    include: { medicineCode: true },
    orderBy: { name: 'asc' },
  });
  return medicines.map(m => formatMedicine(m));
}

export async function getMedicineById(id) {
  const med = await prisma.medicine.findUnique({
    where: { id },
    include: { medicineCode: true },
  });
  if (!med) throw new AppError('Medicine not found', 404);
  return formatMedicine(med);
}

export async function createMedicine(data) {
  const existing = await prisma.medicine.findFirst({ where: { medicineCodeId: data.medicineCodeId } });
  if (existing) throw new AppError('Medicine code is already assigned to another medicine', 400);

  const med = await prisma.medicine.create({
    data: {
      name: data.name,
      medicineCodeId: data.medicineCodeId,
      type: data.type || 'OTHER',
      unit: data.unit || 'PIECES',
      stockLocation: data.stockLocation,
      rackCode: data.rackCode,
      pricePerUnit: data.pricePerUnit ?? 0,
      currentStock: data.currentStock ?? 0,
      minimumStockAlert: data.minimumStockAlert ?? 0,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      active: data.active !== false,
    },
    include: { medicineCode: true },
  });
  return formatMedicine(med);
}

export async function updateMedicine(id, data) {
  const med = await prisma.medicine.findUnique({ where: { id } });
  if (!med) throw new AppError('Medicine not found', 404);

  const allowed = ['name', 'type', 'unit', 'category', 'description', 'stockLocation', 'rackCode', 'currentStock', 'pricePerUnit', 'minimumStockAlert', 'active'];
  const updateData = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }
  if (data.expiryDate !== undefined) {
    updateData.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
  }

  const updated = await prisma.medicine.update({
    where: { id },
    data: updateData,
    include: { medicineCode: true },
  });
  return formatMedicine(updated);
}

export async function deleteMedicine(id) {
  const med = await prisma.medicine.findUnique({ where: { id } });
  if (!med) throw new AppError('Medicine not found', 404);
  await prisma.medicine.delete({ where: { id } });
}
