import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, toMoney } from '../utils/decimal.js';

function formatHerb(herb, latestRate) {
  return {
    id: herb.id,
    name: herb.name,
    herbCodeId: herb.herbCodeId,
    herbCode: herb.herbCode?.code || null,
    unitOfMeasure: herb.unitOfMeasure,
    currentStock: toNumber(herb.currentStock),
    costPerUnit: latestRate != null ? toMoney(latestRate) : toMoney(herb.costPerUnit),
    minimumStockAlert: toNumber(herb.minimumStockAlert),
    storeNumber: herb.storeNumber,
    kanasterBora: herb.kanasterBora,
    kanasterBoraNumber: herb.kanasterBoraNumber,
    description: herb.description,
    active: herb.active,
    createdAt: herb.createdAt,
    updatedAt: herb.updatedAt,
  };
}

function herbDataFromInput(data) {
  return {
    ...(data.name !== undefined ? { name: String(data.name).trim().toUpperCase() } : {}),
    ...(data.herbCodeId !== undefined ? { herbCodeId: data.herbCodeId || null } : {}),
    ...(data.supplierName !== undefined ? { supplierName: data.supplierName } : {}),
    ...(data.supplierContact !== undefined ? { supplierContact: data.supplierContact } : {}),
    ...(data.unitOfMeasure !== undefined ? { unitOfMeasure: data.unitOfMeasure } : {}),
    ...(data.currentStock !== undefined ? { currentStock: data.currentStock } : {}),
    ...(data.costPerUnit !== undefined ? { costPerUnit: data.costPerUnit } : {}),
    ...(data.minimumStockAlert !== undefined ? { minimumStockAlert: data.minimumStockAlert } : {}),
    ...(data.storeNumber !== undefined ? { storeNumber: data.storeNumber || null } : {}),
    ...(data.kanasterBora !== undefined ? { kanasterBora: data.kanasterBora || null } : {}),
    ...(data.kanasterBoraNumber !== undefined ? { kanasterBoraNumber: data.kanasterBoraNumber || null } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.active !== undefined ? { active: data.active } : {}),
  };
}

async function getLatestRatesForHerbs(herbIds) {
  if (!herbIds.length) return new Map();
  const purchases = await prisma.herbPurchase.findMany({
    where: { herbId: { in: herbIds } },
    include: { bill: { select: { billDate: true } } },
  });
  const latest = new Map();
  for (const purchase of purchases) {
    const existing = latest.get(purchase.herbId);
    const purchaseTime = new Date(purchase.bill?.billDate || purchase.purchaseDate).getTime();
    if (!existing || purchaseTime > existing.time) {
      latest.set(purchase.herbId, { rate: purchase.rate, time: purchaseTime });
    }
  }
  return latest;
}

export async function getAllHerbs(search) {
  const where = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { storeNumber: { contains: search } },
      { kanasterBora: { contains: search } },
      { kanasterBoraNumber: { contains: search } },
      { herbCode: { is: { code: { contains: search } } } },
      { herbCode: { is: { name: { contains: search } } } },
    ];
  }
  const herbs = await prisma.herb.findMany({
    where,
    include: { herbCode: true },
    orderBy: { name: 'asc' },
  });
  const rateMap = await getLatestRatesForHerbs(herbs.map(h => h.id));
  return herbs.map(herb => formatHerb(herb, rateMap.get(herb.id)?.rate));
}

export async function getHerbById(id) {
  const herb = await prisma.herb.findUnique({
    where: { id },
    include: { herbCode: true },
  });
  if (!herb) throw new AppError('Herb not found', 404);
  const rateMap = await getLatestRatesForHerbs([herb.id]);
  return formatHerb(herb, rateMap.get(herb.id)?.rate);
}

async function assertKanasterBoraUnique({ kanasterBora, kanasterBoraNumber, excludeId }) {
  const type = kanasterBora ? String(kanasterBora).trim() : '';
  const number = kanasterBoraNumber ? String(kanasterBoraNumber).trim() : '';
  if (!type || !number) return;

  const existing = await prisma.herb.findFirst({
    where: {
      kanasterBora: type,
      kanasterBoraNumber: number,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new AppError(
      `${type} number "${number}" is already assigned to herb "${existing.name}". Each Kanaster/Bora/Drum number can only be used once.`,
      400,
    );
  }
}

export async function ensureHerbFromCode(herbCodeId) {
  const code = await prisma.herbCode.findUnique({ where: { id: herbCodeId } });
  if (!code) throw new AppError('Herb code not found', 404);

  const existing = await prisma.herb.findFirst({
    where: { herbCodeId },
    include: { herbCode: true },
  });
  if (existing) {
    const rateMap = await getLatestRatesForHerbs([existing.id]);
    return formatHerb(existing, rateMap.get(existing.id)?.rate);
  }

  const herb = await prisma.herb.create({
    data: {
      name: code.name,
      herbCodeId: code.id,
      unitOfMeasure: 'KG',
      currentStock: 0,
      costPerUnit: 0,
      minimumStockAlert: 0,
      active: true,
    },
    include: { herbCode: true },
  });
  return formatHerb(herb, null);
}

export async function createHerb(data) {
  if (data.herbCodeId) {
    const existing = await prisma.herb.findFirst({ where: { herbCodeId: data.herbCodeId } });
    if (existing) throw new AppError('Herb code is already assigned to another herb', 400);
  }
  await assertKanasterBoraUnique({
    kanasterBora: data.kanasterBora,
    kanasterBoraNumber: data.kanasterBoraNumber,
  });
  const alertValue = data.minimumStockAlert == null ? 0 : Number(data.minimumStockAlert);
  const herb = await prisma.herb.create({
    data: {
      ...herbDataFromInput(data),
      name: String(data.name).trim().toUpperCase(),
      unitOfMeasure: data.unitOfMeasure || 'KG',
      currentStock: data.currentStock ?? 0,
      costPerUnit: data.costPerUnit ?? 0,
      minimumStockAlert: Number.isFinite(alertValue) ? alertValue : 0,
      active: data.active !== false,
    },
    include: { herbCode: true },
  });
  const rateMap = await getLatestRatesForHerbs([herb.id]);
  return formatHerb(herb, rateMap.get(herb.id)?.rate);
}

export async function updateHerb(id, data) {
  const herb = await prisma.herb.findUnique({ where: { id } });
  if (!herb) throw new AppError('Herb not found', 404);
  if (data.herbCodeId && data.herbCodeId !== herb.herbCodeId) {
    const existing = await prisma.herb.findFirst({ where: { herbCodeId: data.herbCodeId, id: { not: id } } });
    if (existing) throw new AppError('Herb code is already assigned to another herb', 400);
  }
  const nextType = data.kanasterBora !== undefined ? data.kanasterBora : herb.kanasterBora;
  const nextNumber = data.kanasterBoraNumber !== undefined ? data.kanasterBoraNumber : herb.kanasterBoraNumber;
  await assertKanasterBoraUnique({
    kanasterBora: nextType,
    kanasterBoraNumber: nextNumber,
    excludeId: id,
  });
  const patch = herbDataFromInput(data);
  if (data.minimumStockAlert !== undefined) {
    const alertValue = Number(data.minimumStockAlert);
    patch.minimumStockAlert = Number.isFinite(alertValue) ? alertValue : 0;
  }
  const updated = await prisma.herb.update({
    where: { id },
    data: patch,
    include: { herbCode: true },
  });
  const rateMap = await getLatestRatesForHerbs([updated.id]);
  return formatHerb(updated, rateMap.get(updated.id)?.rate);
}

export async function deleteHerb(id) {
  const herb = await prisma.herb.findUnique({ where: { id } });
  if (!herb) throw new AppError('Herb not found', 404);

  const recipeUsage = await prisma.recipeItem.count({ where: { herbId: id } });
  if (recipeUsage > 0) {
    throw new AppError('Cannot delete herb used in formulas', 400);
  }

  await prisma.herb.delete({ where: { id } });
}
