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

export function packDescription(firmName, description) {
  const firm = (firmName || '').trim();
  const desc = (description || '').trim();
  if (!firm && !desc) return null;
  if (!firm) return desc;
  return `[Firm: ${firm}]\n${desc}`.trim();
}

export function unpackDescription(rawDescription) {
  if (!rawDescription) return { firmName: '', description: '' };
  const str = String(rawDescription).trim();
  const match = str.match(/^\[Firm:\s*([^\]]+)\](?:\r?\n)?([\s\S]*)$/);
  if (match) {
    return {
      firmName: match[1].trim(),
      description: match[2].trim(),
    };
  }
  return {
    firmName: '',
    description: str,
  };
}

function formatRecipeItems(recipeItems) {
  return (recipeItems || []).map(ri => ({
    id: ri.id,
    herbId: ri.herbId,
    herbCodeId: ri.herb?.herbCodeId || null,
    herbCode: ri.herb?.herbCode?.code || null,
    herbName: ri.herb?.name,
    costPerUnit: toNumber(ri.herb?.costPerUnit ?? 0),
    quantity: toNumber(ri.quantity),
    unit: ri.unit || ri.herb?.unitOfMeasure || 'KG',
  }));
}

export async function getRecipeByMedicineCodeId(medicineCodeId) {
  const code = await prisma.medicineCode.findUnique({
    where: { id: medicineCodeId },
    include: {
      recipeItems: { include: { herb: { include: { herbCode: true } } } },
    },
  });
  if (!code) throw new AppError('Medicine code not found', 404);
  const unpacked = unpackDescription(code.description);
  return {
    medicineCodeId: code.id,
    medicineCode: code.code,
    medicineName: code.name,
    firmName: unpacked.firmName,
    description: unpacked.description,
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
    include: { herb: { include: { herbCode: true } } },
  });
}

export async function updateRecipeByMedicineCodeId(medicineCodeId, data) {
  const code = await prisma.medicineCode.findUnique({ where: { id: medicineCodeId } });
  if (!code) throw new AppError('Medicine code not found', 404);

  const items = Array.isArray(data) ? data : (data.items || []);
  const formulaQuantity = Array.isArray(data) ? undefined : data.formulaQuantity;
  const formulaUnit = Array.isArray(data) ? undefined : data.formulaUnit;
  const rawDescription = Array.isArray(data) ? undefined : data.description;
  const firmName = Array.isArray(data) ? undefined : data.firmName;

  const currentUnpacked = unpackDescription(code.description);
  const packedDescription = (rawDescription !== undefined || firmName !== undefined)
    ? packDescription(
        firmName !== undefined ? firmName : currentUnpacked.firmName,
        rawDescription !== undefined ? rawDescription : currentUnpacked.description,
      )
    : undefined;

  if (!items.length) {
    throw new AppError('Add at least one element with quantity before saving the formula', 400);
  }

  const seenHerbIds = new Set();
  for (const item of items) {
    const herbId = parseInt(item.herbId, 10);
    if (seenHerbIds.has(herbId)) {
      const herb = await prisma.herb.findUnique({ where: { id: herbId } });
      throw new AppError(
        `Element "${herb?.name || herbId}" is added more than once. Each element can appear only once in a formula.`,
        400,
      );
    }
    seenHerbIds.add(herbId);

    const herb = await prisma.herb.findUnique({ where: { id: herbId } });
    if (!herb) throw new AppError('Element does not exist in Store.', 400);
    const herbUnit = herb.unitOfMeasure || 'KG';
    const recipeUnit = item.unit || herbUnit;
    if (UNIT_FAMILY[recipeUnit] !== UNIT_FAMILY[herbUnit]) {
      throw new AppError(
        `Unit for ${herb.name} must match element unit family (${herbUnit}). Use mass (KG/GRAMS), volume (LITERS/ML), or PIECES accordingly.`,
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

  await prisma.$transaction(async (tx) => {
    if (formulaQuantity !== undefined || formulaUnit !== undefined || packedDescription !== undefined) {
      await tx.medicineCode.update({
        where: { id: medicineCodeId },
        data: {
          ...(formulaQuantity !== undefined ? { formulaQuantity } : {}),
          ...(formulaUnit !== undefined ? { formulaUnit } : {}),
          ...(packedDescription !== undefined ? { description: packedDescription } : {}),
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

export async function deleteRecipeByMedicineCodeId(medicineCodeId) {
  const code = await prisma.medicineCode.findUnique({ where: { id: medicineCodeId } });
  if (!code) throw new AppError('Medicine code not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.recipeItem.deleteMany({ where: { medicineCodeId } });
  });

  return { message: 'Formula deleted successfully', medicineCodeId };
}
