import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber } from '../utils/decimal.js';

const UNIT_FAMILY = {
  KG: 'mass',
  GRAMS: 'mass',
  LITERS: 'volume',
  ML: 'volume',
  PIECES: 'count',
};

function formatRecipeItems(recipeItems) {
  return (recipeItems || []).map(ri => ({
    id: ri.id,
    herbId: ri.herbId,
    herbName: ri.herb?.name,
    quantity: toNumber(ri.quantity),
    unit: ri.unit || ri.herb?.unitOfMeasure || 'KG',
  }));
}

export async function getRecipeByMedicineCodeId(medicineCodeId) {
  const code = await prisma.medicineCode.findUnique({
    where: { id: medicineCodeId },
    include: {
      recipeItems: { include: { herb: true } },
    },
  });
  if (!code) throw new AppError('Medicine code not found', 404);
  return {
    medicineCodeId: code.id,
    medicineCode: code.code,
    medicineName: code.name,
    formulaQuantity: toNumber(code.formulaQuantity ?? 1),
    formulaUnit: code.formulaUnit || 'PIECES',
    items: formatRecipeItems(code.recipeItems),
  };
}

export async function getRecipeWithHerbs(medicineCodeId) {
  const code = await prisma.medicineCode.findUnique({ where: { id: medicineCodeId } });
  if (!code) throw new AppError('Medicine code not found', 404);
  return prisma.recipeItem.findMany({
    where: { medicineCodeId },
    include: { herb: true },
  });
}

export async function updateRecipeByMedicineCodeId(medicineCodeId, data) {
  const code = await prisma.medicineCode.findUnique({ where: { id: medicineCodeId } });
  if (!code) throw new AppError('Medicine code not found', 404);

  const items = Array.isArray(data) ? data : (data.items || []);
  const formulaQuantity = Array.isArray(data) ? undefined : data.formulaQuantity;
  const formulaUnit = Array.isArray(data) ? undefined : data.formulaUnit;

  if (!items.length) {
    throw new AppError('Add at least one herb with quantity before saving the formula', 400);
  }

  const seenHerbIds = new Set();
  for (const item of items) {
    const herbId = parseInt(item.herbId, 10);
    if (seenHerbIds.has(herbId)) {
      const herb = await prisma.herb.findUnique({ where: { id: herbId } });
      throw new AppError(
        `Herb "${herb?.name || herbId}" is added more than once. Each herb can appear only once in a formula.`,
        400,
      );
    }
    seenHerbIds.add(herbId);

    const herb = await prisma.herb.findUnique({ where: { id: herbId } });
    if (!herb) throw new AppError(`Herb ${herbId} not found`, 400);
    const herbUnit = herb.unitOfMeasure || 'KG';
    const recipeUnit = item.unit || herbUnit;
    if (UNIT_FAMILY[recipeUnit] !== UNIT_FAMILY[herbUnit]) {
      throw new AppError(
        `Unit for ${herb.name} must match herb unit family (${herbUnit}). Use mass (KG/GRAMS), volume (LITERS/ML), or PIECES accordingly.`,
        400,
      );
    }
    item.herbId = herbId;
    item.unit = recipeUnit;
  }

  const medQty = formulaQuantity !== undefined ? toNumber(formulaQuantity) : toNumber(code.formulaQuantity ?? 1);
  const medUnit = formulaUnit || code.formulaUnit || 'PIECES';
  if (!(medQty > 0)) {
    throw new AppError('Medicine quantity must be greater than 0', 400);
  }

  const toBase = (quantity, unit) => {
    const q = toNumber(quantity);
    switch (unit) {
      case 'KG': return q * 1000;
      case 'GRAMS': return q;
      case 'LITERS': return q * 1000;
      case 'ML': return q;
      case 'PIECES': return q;
      default: return q;
    }
  };
  const fromBase = (baseQty, unit) => {
    const q = toNumber(baseQty);
    switch (unit) {
      case 'KG': return q / 1000;
      case 'GRAMS': return q;
      case 'LITERS': return q / 1000;
      case 'ML': return q;
      case 'PIECES': return q;
      default: return q;
    }
  };

  let herbBase = 0;
  for (const item of items) {
    if (UNIT_FAMILY[item.unit] !== UNIT_FAMILY[medUnit]) {
      throw new AppError(
        `Herb unit ${item.unit} cannot be matched to medicine unit ${medUnit}. Use the same unit type.`,
        400,
      );
    }
    herbBase += toBase(item.quantity, item.unit);
  }
  const herbTotal = fromBase(herbBase, medUnit);
  if (herbTotal + 1e-9 < medQty) {
    throw new AppError(
      `Herb total (${herbTotal} ${medUnit}) is less than medicine quantity (${medQty} ${medUnit})`,
      400,
    );
  }
  if (herbTotal > medQty + 1e-9) {
    throw new AppError(
      `Herb total (${herbTotal} ${medUnit}) is more than medicine quantity (${medQty} ${medUnit})`,
      400,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (formulaQuantity !== undefined || formulaUnit !== undefined) {
      await tx.medicineCode.update({
        where: { id: medicineCodeId },
        data: {
          ...(formulaQuantity !== undefined ? { formulaQuantity } : {}),
          ...(formulaUnit !== undefined ? { formulaUnit } : {}),
        },
      });
    }

    await tx.recipeItem.deleteMany({ where: { medicineCodeId } });
    for (const item of items) {
      await tx.recipeItem.create({
        data: {
          medicineCodeId,
          herbId: item.herbId,
          quantity: item.quantity,
          unit: item.unit || 'KG',
        },
      });
    }
  });

  return getRecipeByMedicineCodeId(medicineCodeId);
}

export async function resolveMedicineCodeIdForMedicine(medicineId) {
  const med = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!med) throw new AppError('Medicine not found', 404);
  if (!med.medicineCodeId) throw new AppError('Medicine is not linked to a medicine code', 400);
  return med.medicineCodeId;
}
