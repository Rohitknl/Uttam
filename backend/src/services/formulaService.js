import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, multiply, subtract, divide } from '../utils/decimal.js';
import { getRecipeWithHerbs } from './recipeService.js';

const UNIT_FAMILY = {
  KG: 'mass',
  GRAMS: 'mass',
  LITERS: 'volume',
  ML: 'volume',
  PIECES: 'count',
};

/** Convert quantity into a comparable base (grams / ml / pieces). */
function toBase(quantity, unit) {
  const q = toNumber(quantity);
  switch (unit) {
    case 'KG': return q * 1000;
    case 'GRAMS': return q;
    case 'LITERS': return q * 1000;
    case 'ML': return q;
    case 'PIECES': return q;
    default: return q;
  }
}

function fromBase(baseQty, unit) {
  const q = toNumber(baseQty);
  switch (unit) {
    case 'KG': return q / 1000;
    case 'GRAMS': return q;
    case 'LITERS': return q / 1000;
    case 'ML': return q;
    case 'PIECES': return q;
    default: return q;
  }
}

function convertQuantity(quantity, fromUnit, toUnit) {
  const from = fromUnit || toUnit || 'KG';
  const to = toUnit || from;
  if (from === to) return toNumber(quantity);
  if (UNIT_FAMILY[from] !== UNIT_FAMILY[to]) {
    return toNumber(quantity);
  }
  return toNumber(fromBase(toBase(quantity, from), to));
}

function recipeUnitOf(ri) {
  return ri.unit || ri.herb?.unitOfMeasure || 'KG';
}

function stockUnitOf(ri) {
  return ri.herb?.unitOfMeasure || ri.unit || 'KG';
}

function buildRequirement(ri, scale) {
  const recipeUnit = recipeUnitOf(ri);
  const stockUnit = stockUnitOf(ri);
  const quantityPerUnit = toNumber(ri.quantity);
  const scaledInRecipeUnit = toNumber(multiply(ri.quantity, scale));
  const requiredInStockUnit = convertQuantity(scaledInRecipeUnit, recipeUnit, stockUnit);
  const availableStock = toNumber(ri.herb.currentStock);
  const availableInRecipeUnit = convertQuantity(availableStock, stockUnit, recipeUnit);
  const shortageInRecipeUnit = Math.max(0, toNumber(subtract(scaledInRecipeUnit, availableInRecipeUnit)));
  const sufficient = availableStock + 1e-9 >= requiredInStockUnit;

  return {
    herbId: ri.herbId,
    herbName: ri.herb.name,
    unitOfMeasure: recipeUnit,
    stockUnit,
    quantityPerUnit,
    scaledQuantity: scaledInRecipeUnit,
    requiredInStockUnit: toNumber(requiredInStockUnit),
    availableStock,
    availableInRecipeUnit: toNumber(availableInRecipeUnit),
    shortage: toNumber(shortageInRecipeUnit),
    sufficient,
  };
}

async function getCodeContext(medicineCodeId) {
  const code = await prisma.medicineCode.findUnique({ where: { id: medicineCodeId } });
  if (!code) throw new AppError('Medicine code not found', 404);
  return code;
}

export async function validateFormula(medicineCodeId, batchSize) {
  const code = await getCodeContext(medicineCodeId);
  const recipe = await getRecipeWithHerbs(medicineCodeId);
  if (recipe.length === 0) {
    return { valid: false, items: [], message: 'No formula defined for this medicine code' };
  }

  const baseQty = toNumber(code.formulaQuantity ?? 1) || 1;
  const scale = toNumber(divide(batchSize, baseQty));
  const items = recipe.map(ri => buildRequirement(ri, scale));
  const valid = items.every(i => i.sufficient);

  return {
    valid,
    items,
    formulaQuantity: baseQty,
    formulaUnit: code.formulaUnit || 'PIECES',
    message: valid
      ? 'Stock sufficient'
      : `Insufficient herb stock: ${items.filter(i => !i.sufficient).map(s => (
        `${s.herbName} (need ${s.scaledQuantity} ${s.unitOfMeasure}, have ${s.availableInRecipeUnit} ${s.unitOfMeasure} / ${s.availableStock} ${s.stockUnit})`
      )).join('; ')}`,
  };
}

export async function generateFormula(medicineCodeId, batchSize) {
  const code = await getCodeContext(medicineCodeId);
  const recipe = await getRecipeWithHerbs(medicineCodeId);
  if (recipe.length === 0) {
    throw new AppError('No base formula defined for this medicine code', 400);
  }

  const baseQty = toNumber(code.formulaQuantity ?? 1) || 1;
  const scale = toNumber(divide(batchSize, baseQty));
  const items = recipe.map(ri => buildRequirement(ri, scale));
  const shortages = items.filter(i => !i.sufficient);
  const sufficient = shortages.length === 0;

  return {
    medicineCodeId: code.id,
    medicineName: code.name,
    medicineCode: code.code,
    formulaQuantity: baseQty,
    formulaUnit: code.formulaUnit || 'PIECES',
    batchSize: toNumber(batchSize),
    sufficient,
    message: sufficient
      ? 'Stock sufficient'
      : `Insufficient herb stock: ${shortages.map(s => (
        `${s.herbName} (need ${s.scaledQuantity} ${s.unitOfMeasure}, available ${s.availableInRecipeUnit} ${s.unitOfMeasure})`
      )).join('; ')}`,
    items,
  };
}

export async function saveFormula(medicineCodeId, batchSize, items) {
  const code = await getCodeContext(medicineCodeId);
  const existing = await getRecipeWithHerbs(medicineCodeId);
  const unitByHerb = Object.fromEntries(existing.map(ri => [ri.herbId, ri.unit || ri.herb.unitOfMeasure || 'KG']));
  const baseQty = toNumber(code.formulaQuantity ?? 1) || 1;

  const perUnitItems = items.map(item => ({
    herbId: item.herbId,
    quantity: toNumber(divide(multiply(item.scaledQuantity, baseQty), batchSize)),
    unit: unitByHerb[item.herbId] || 'KG',
  }));

  await prisma.$transaction(async (tx) => {
    await tx.recipeItem.deleteMany({ where: { medicineCodeId } });
    for (const item of perUnitItems) {
      await tx.recipeItem.create({
        data: { medicineCodeId, herbId: item.herbId, quantity: item.quantity, unit: item.unit },
      });
    }
  });

  return generateFormula(medicineCodeId, batchSize);
}

export async function consumeFormula(medicineCodeId, batchSize) {
  const validation = await validateFormula(medicineCodeId, batchSize);
  if (!validation.valid) {
    throw new AppError(validation.message || 'Cannot consume — insufficient herb stock', 400);
  }

  const code = await getCodeContext(medicineCodeId);
  const recipe = await getRecipeWithHerbs(medicineCodeId);
  if (recipe.length === 0) {
    throw new AppError('No formula defined for this medicine code', 400);
  }

  const baseQty = toNumber(code.formulaQuantity ?? 1) || 1;
  const scale = toNumber(divide(batchSize, baseQty));

  const consumed = [];
  await prisma.$transaction(async (tx) => {
    for (const ri of recipe) {
      const recipeUnit = recipeUnitOf(ri);
      const stockUnit = stockUnitOf(ri);
      const requiredInRecipeUnit = toNumber(multiply(ri.quantity, scale));
      const requiredInStockUnit = convertQuantity(requiredInRecipeUnit, recipeUnit, stockUnit);

      const herb = await tx.herb.findUnique({ where: { id: ri.herbId } });
      const available = toNumber(herb.currentStock);
      if (available + 1e-9 < requiredInStockUnit) {
        throw new AppError(
          `Insufficient stock for ${ri.herb.name}: need ${requiredInRecipeUnit} ${recipeUnit}, have ${convertQuantity(available, stockUnit, recipeUnit)} ${recipeUnit}`,
          400,
        );
      }

      const newStock = toNumber(subtract(available, requiredInStockUnit));
      await tx.herb.update({
        where: { id: ri.herbId },
        data: { currentStock: newStock },
      });
      consumed.push({
        herbId: ri.herbId,
        herbName: ri.herb.name,
        unitOfMeasure: recipeUnit,
        stockUnit,
        consumed: requiredInRecipeUnit,
        consumedInStockUnit: requiredInStockUnit,
        remainingStock: newStock,
      });
    }
  });

  return consumed;
}

export async function previewProduction(medicineId, quantity) {
  const med = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!med) throw new AppError('Medicine not found', 404);
  if (!med.medicineCodeId) {
    return { medicineId, quantity, requirements: [], sufficient: false };
  }

  const recipe = await getRecipeWithHerbs(med.medicineCodeId);
  if (recipe.length === 0) {
    return { medicineId, quantity, requirements: [], sufficient: false };
  }

  const code = await prisma.medicineCode.findUnique({ where: { id: med.medicineCodeId } });
  const baseQty = toNumber(code?.formulaQuantity ?? 1) || 1;
  const scale = toNumber(divide(quantity, baseQty));

  const requirements = recipe.map(ri => {
    const req = buildRequirement(ri, scale);
    return {
      herbId: req.herbId,
      herbName: req.herbName,
      unitOfMeasure: req.unitOfMeasure,
      stockUnit: req.stockUnit,
      requiredQuantity: req.scaledQuantity,
      availableStock: req.availableStock,
      availableInRecipeUnit: req.availableInRecipeUnit,
      sufficient: req.sufficient,
    };
  });

  return {
    medicineId,
    quantity,
    requirements,
    sufficient: requirements.every(r => r.sufficient),
  };
}
