import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { toNumber, toMoney, multiply, add, subtract, divide } from '../utils/decimal.js';
import { parseHerbName } from '../utils/codeParser.js';

function resolveTaxInput(data = {}) {
  let gstPercent = toNumber(data.gstPercent ?? 0, 2);
  let igstPercent = toNumber(data.igstPercent ?? 0, 2);

  // Legacy single taxType + taxPercent payloads
  if ((!gstPercent && !igstPercent) && data.taxType && data.taxType !== 'NONE') {
    const pct = toNumber(data.taxPercent ?? 0, 2);
    if (data.taxType === 'GST') gstPercent = pct;
    else if (data.taxType === 'IGST') igstPercent = pct;
    else if (data.taxType === 'BOTH') {
      gstPercent = pct;
      igstPercent = toNumber(data.igstPercent ?? 0, 2);
    }
  }

  if (gstPercent < 0 || gstPercent > 100 || igstPercent < 0 || igstPercent > 100) {
    throw new AppError('Tax percentage must be between 0 and 100', 400);
  }
  if (data.applyGst && !(gstPercent > 0)) {
    throw new AppError('GST percentage is required when GST is applied', 400);
  }
  if (data.applyIgst && !(igstPercent > 0)) {
    throw new AppError('IGST percentage is required when IGST is applied', 400);
  }

  const taxType = gstPercent > 0 && igstPercent > 0
    ? 'BOTH'
    : gstPercent > 0
      ? 'GST'
      : igstPercent > 0
        ? 'IGST'
        : 'NONE';

  return { taxType, taxPercent: gstPercent, igstPercent };
}

function calculateBillTotals(subtotal, taxPercent = 0, igstPercent = 0) {
  const subtotalAmount = toMoney(subtotal);
  const gstAmount = taxPercent > 0
    ? toMoney(multiply(subtotalAmount, divide(taxPercent, 100)))
    : 0;
  const igstAmount = igstPercent > 0
    ? toMoney(multiply(subtotalAmount, divide(igstPercent, 100)))
    : 0;
  const taxAmount = toMoney(add(gstAmount, igstAmount));
  return {
    subtotalAmount,
    gstAmount,
    igstAmount,
    taxAmount,
    totalAmount: toMoney(add(subtotalAmount, taxAmount)),
  };
}

function formatBillLine(line) {
  return {
    id: line.id,
    billId: line.billId,
    herbId: line.herbId,
    herbCodeId: line.herbCodeId,
    herbCode: line.herbCode,
    herbName: line.herbName,
    quantity: toNumber(line.quantity),
    rate: toMoney(line.rate),
    amount: toMoney(line.amount),
    unit: line.unit,
  };
}

function formatBill(bill) {
  const sub = toMoney(bill.subtotalAmount);
  const storedGst = toNumber(bill.taxPercent, 2);
  const storedIgst = toNumber(bill.igstPercent ?? 0, 2);
  const taxType = bill.taxType || 'NONE';

  // taxPercent holds GST %; for legacy IGST-only rows the rate lived in taxPercent
  const gstPercent = (taxType === 'GST' || taxType === 'BOTH') ? storedGst : 0;
  const igstPercent = taxType === 'BOTH'
    ? storedIgst
    : taxType === 'IGST'
      ? (storedIgst > 0 ? storedIgst : storedGst)
      : 0;

  const gstAmount = gstPercent > 0 ? toMoney(multiply(sub, divide(gstPercent, 100))) : 0;
  const igstAmount = igstPercent > 0 ? toMoney(multiply(sub, divide(igstPercent, 100))) : 0;

  return {
    id: bill.id,
    billNumber: bill.billNumber,
    supplierName: bill.supplierName,
    supplierContact: bill.supplierContact,
    supplierEmail: bill.supplierEmail,
    supplierAddress: bill.supplierAddress,
    consigneeName: bill.consigneeName,
    consigneeAddress: bill.consigneeAddress,
    billDate: bill.billDate,
    subtotalAmount: sub,
    taxType,
    taxPercent: gstPercent,
    igstPercent,
    gstAmount,
    igstAmount,
    taxAmount: toMoney(bill.taxAmount),
    totalAmount: toMoney(bill.totalAmount),
    notes: bill.notes,
    lines: bill.lines?.map(formatBillLine) || [],
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

export async function getAllBills(search) {
  const where = search ? {
    OR: [
      { billNumber: { contains: search } },
      { supplierName: { contains: search } },
      { consigneeName: { contains: search } },
    ],
  } : undefined;
  const bills = await prisma.supplierBill.findMany({
    where,
    include: { lines: true },
    orderBy: { billDate: 'desc' },
  });
  return bills.map(formatBill);
}

export async function getBillById(id) {
  const bill = await prisma.supplierBill.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!bill) throw new AppError('Bill not found', 404);
  return formatBill(bill);
}

export async function createBill(data) {
  const herbCodeIds = data.lines.map(l => l.herbCodeId);
  const uniqueIds = new Set(herbCodeIds);
  if (uniqueIds.size !== herbCodeIds.length) {
    throw new AppError('Each herb code can only be used once per bill', 400);
  }

  for (const line of data.lines) {
    const herbCode = await prisma.herbCode.findUnique({ where: { id: line.herbCodeId } });
    if (!herbCode) throw new AppError(`Herb code ${line.herbCodeId} not found`, 400);
    line.herbCode = line.herbCode || herbCode.code;
  }

  const { taxType, taxPercent, igstPercent } = resolveTaxInput(data);

  return prisma.$transaction(async (tx) => {
    let subtotal = 0;
    const processedLines = [];

    for (const line of data.lines) {
      const amount = line.amount ?? toMoney(multiply(line.rate, line.quantity));
      subtotal = toMoney(add(subtotal, amount));
      processedLines.push({ ...line, amount });
    }

    const totals = calculateBillTotals(subtotal, taxPercent, igstPercent);

    const bill = await tx.supplierBill.create({
      data: {
        billNumber: data.billNumber,
        supplierName: data.supplierName,
        supplierContact: data.supplierContact,
        supplierEmail: data.supplierEmail || null,
        supplierAddress: data.supplierAddress,
        consigneeName: data.consigneeName || null,
        consigneeAddress: data.consigneeAddress || null,
        billDate: new Date(data.billDate),
        subtotalAmount: totals.subtotalAmount,
        taxType,
        taxPercent,
        igstPercent,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        notes: data.notes,
      },
    });

    const billLines = [];
    const header = {
      supplierName: data.supplierName,
      billDate: data.billDate,
    };

    for (const line of processedLines) {
      const billLine = await addBillLineToHerbStock(tx, bill.id, line, header);
      billLines.push(billLine);
    }

    return formatBill({ ...bill, lines: billLines });
  });
}

async function syncHerbRateFromLatestBill(tx, herbId) {
  const purchases = await tx.herbPurchase.findMany({
    where: { herbId },
    include: { bill: { select: { billDate: true } } },
  });
  if (!purchases.length) return;

  purchases.sort((a, b) => {
    const timeA = new Date(a.bill?.billDate || a.purchaseDate).getTime();
    const timeB = new Date(b.bill?.billDate || b.purchaseDate).getTime();
    return timeB - timeA;
  });

  await tx.herb.update({
    where: { id: herbId },
    data: { costPerUnit: purchases[0].rate },
  });
}

async function addBillLineToHerbStock(tx, billId, line, header) {
  const herbCode = await tx.herbCode.findUnique({ where: { id: line.herbCodeId } });
  if (!herbCode) throw new AppError(`Herb code ${line.herbCodeId} not found`, 400);

  const amount = line.amount ?? toMoney(multiply(line.rate, line.quantity));
  let herb = await tx.herb.findFirst({ where: { herbCodeId: line.herbCodeId } });

  if (herb) {
    herb = await tx.herb.update({
      where: { id: herb.id },
      data: {
        name: line.herbName,
        currentStock: toNumber(add(herb.currentStock, line.quantity)),
        unitOfMeasure: line.unit || herb.unitOfMeasure,
      },
    });
  } else {
    const parsedLineName = parseHerbName(line.herbName || herbCode.name);
    const extractedNum = parsedLineName.number || null;

    herb = await tx.herb.create({
      data: {
        name: line.herbName,
        herbCodeId: line.herbCodeId,
        unitOfMeasure: line.unit || 'KG',
        currentStock: line.quantity,
        costPerUnit: line.rate,
        minimumStockAlert: 0,
        kanasterBoraNumber: extractedNum,
        active: true,
      },
    });
  }

  const billLine = await tx.supplierBillLine.create({
    data: {
      billId,
      herbId: herb.id,
      herbCodeId: line.herbCodeId,
      herbCode: line.herbCode || herbCode.code,
      herbName: line.herbName,
      quantity: line.quantity,
      rate: line.rate,
      amount,
      unit: line.unit || 'KG',
    },
  });

  await tx.herbPurchase.create({
    data: {
      herbId: herb.id,
      quantity: line.quantity,
      rate: line.rate,
      amount,
      supplierName: header.supplierName,
      billId,
      purchaseDate: header.billDate ? new Date(header.billDate) : new Date(),
    },
  });

  await syncHerbRateFromLatestBill(tx, herb.id);
  return billLine;
}

async function deleteBillLineInTx(tx, billId, line) {
  if (line.herbId) {
    const herb = await tx.herb.findUnique({ where: { id: line.herbId } });
    if (herb) {
      const newStock = toNumber(subtract(herb.currentStock, line.quantity));
      if (newStock < 0) {
        throw new AppError('Cannot remove line: herb stock would become negative', 400);
      }
      await tx.herb.update({
        where: { id: line.herbId },
        data: { currentStock: newStock },
      });
    }
    await tx.herbPurchase.deleteMany({ where: { herbId: line.herbId, billId } });
    await syncHerbRateFromLatestBill(tx, line.herbId);
  }
  await tx.supplierBillLine.delete({ where: { id: line.id } });
}

async function createBillLineInTx(tx, billId, line, header) {
  return addBillLineToHerbStock(tx, billId, line, header);
}

async function updateBillLineInTx(tx, billId, existingLine, line, header) {
  const newQuantity = line.quantity;
  const newRate = line.rate;
  const amount = line.amount ?? toMoney(multiply(newRate, newQuantity));
  const quantityDelta = toNumber(newQuantity) - toNumber(existingLine.quantity);

  const updatedLine = await tx.supplierBillLine.update({
    where: { id: existingLine.id },
    data: {
      herbName: line.herbName,
      quantity: newQuantity,
      rate: newRate,
      amount,
      unit: line.unit || existingLine.unit,
    },
  });

  if (existingLine.herbId) {
    const herb = await tx.herb.findUnique({ where: { id: existingLine.herbId } });
    if (herb) {
      const newStock = toNumber(add(herb.currentStock, quantityDelta));
      if (newStock < 0) {
        throw new AppError('Cannot update line: herb stock would become negative', 400);
      }
      await tx.herb.update({
        where: { id: existingLine.herbId },
        data: {
          name: line.herbName,
          currentStock: newStock,
          unitOfMeasure: line.unit || herb.unitOfMeasure,
        },
      });
    }

    await tx.herbPurchase.updateMany({
      where: { herbId: existingLine.herbId, billId },
      data: {
        quantity: newQuantity,
        rate: newRate,
        amount,
        supplierName: header.supplierName,
      },
    });

    await syncHerbRateFromLatestBill(tx, existingLine.herbId);
  }

  return updatedLine;
}

export async function updateBill(id, data) {
  const bill = await prisma.supplierBill.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!bill) throw new AppError('Bill not found', 404);

  const herbCodeIds = data.lines.map(l => l.herbCodeId);
  if (new Set(herbCodeIds).size !== herbCodeIds.length) {
    throw new AppError('Each herb code can only be used once per bill', 400);
  }

  const { taxType, taxPercent, igstPercent } = resolveTaxInput(data);

  const header = {
    supplierName: data.supplierName,
    supplierContact: data.supplierContact,
    billDate: data.billDate,
  };

  return prisma.$transaction(async (tx) => {
    const payloadIds = new Set(data.lines.filter(l => l.id).map(l => l.id));

    for (const existingLine of bill.lines) {
      if (!payloadIds.has(existingLine.id)) {
        await deleteBillLineInTx(tx, id, existingLine);
      }
    }

    for (const line of data.lines) {
      if (line.id) {
        const existingLine = bill.lines.find(l => l.id === line.id);
        if (!existingLine) throw new AppError(`Bill line ${line.id} not found`, 404);
        await updateBillLineInTx(tx, id, existingLine, line, header);
      } else {
        await createBillLineInTx(tx, id, line, header);
      }
    }

    const allLines = await tx.supplierBillLine.findMany({ where: { billId: id } });
    const subtotal = allLines.reduce((sum, l) => toMoney(add(sum, l.amount)), 0);
    const totals = calculateBillTotals(subtotal, taxPercent, igstPercent);

    const updatedBill = await tx.supplierBill.update({
      where: { id },
      data: {
        billNumber: data.billNumber,
        supplierName: data.supplierName,
        supplierContact: data.supplierContact,
        supplierEmail: data.supplierEmail || null,
        supplierAddress: data.supplierAddress,
        consigneeName: data.consigneeName || null,
        consigneeAddress: data.consigneeAddress || null,
        billDate: new Date(data.billDate),
        subtotalAmount: totals.subtotalAmount,
        taxType,
        taxPercent,
        igstPercent,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        notes: data.notes,
      },
      include: { lines: true },
    });

    return formatBill(updatedBill);
  });
}

async function syncBillTotals(tx, billId) {
  const bill = await tx.supplierBill.findUnique({ where: { id: billId } });
  if (!bill) return;

  const allLines = await tx.supplierBillLine.findMany({ where: { billId } });
  const subtotal = allLines.reduce((sum, l) => toMoney(add(sum, l.amount)), 0);
  const gstPct = (bill.taxType === 'GST' || bill.taxType === 'BOTH') ? toNumber(bill.taxPercent, 2) : 0;
  const igstPct = bill.taxType === 'BOTH'
    ? toNumber(bill.igstPercent ?? 0, 2)
    : bill.taxType === 'IGST'
      ? (toNumber(bill.igstPercent ?? 0, 2) || toNumber(bill.taxPercent, 2))
      : 0;
  const totals = calculateBillTotals(subtotal, gstPct, igstPct);

  await tx.supplierBill.update({
    where: { id: billId },
    data: {
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
    },
  });
}

export async function updateBillLine(billId, lineId, data) {
  const line = await prisma.supplierBillLine.findFirst({
    where: { id: lineId, billId },
  });
  if (!line) throw new AppError('Bill line not found', 404);

  const newQuantity = data.quantity ?? toNumber(line.quantity);
  const newRate = data.rate ?? toNumber(line.rate);
  const amount = data.amount ?? toMoney(multiply(newRate, newQuantity));
  const quantityDelta = toNumber(newQuantity) - toNumber(line.quantity);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLine = await tx.supplierBillLine.update({
      where: { id: lineId },
      data: {
        quantity: newQuantity,
        rate: newRate,
        amount,
        herbName: data.herbName ?? line.herbName,
        unit: data.unit ?? line.unit,
      },
    });

    if (line.herbId) {
      const herb = await tx.herb.findUnique({ where: { id: line.herbId } });
      if (herb) {
        const newStock = toNumber(add(herb.currentStock, quantityDelta));
        if (newStock < 0) {
          throw new AppError('Cannot update line: herb stock would become negative', 400);
        }
        await tx.herb.update({
          where: { id: line.herbId },
          data: {
            name: data.herbName ?? line.herbName,
            currentStock: newStock,
            unitOfMeasure: data.unit ?? herb.unitOfMeasure,
          },
        });
      }

      await tx.herbPurchase.updateMany({
        where: { herbId: line.herbId, billId },
        data: {
          quantity: newQuantity,
          rate: newRate,
          amount,
        },
      });

      await syncHerbRateFromLatestBill(tx, line.herbId);
    }

    await syncBillTotals(tx, billId);
    return updatedLine;
  });

  return formatBillLine(updated);
}

export async function deleteBillLine(billId, lineId) {
  const line = await prisma.supplierBillLine.findFirst({
    where: { id: lineId, billId },
  });
  if (!line) throw new AppError('Bill line not found', 404);

  await prisma.$transaction(async (tx) => {
    await deleteBillLineInTx(tx, billId, line);
    await syncBillTotals(tx, billId);
  });
}

export async function deleteBill(id) {
  const bill = await prisma.supplierBill.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!bill) throw new AppError('Bill not found', 404);

  await prisma.$transaction(async (tx) => {
    for (const line of bill.lines) {
      await deleteBillLineInTx(tx, id, line);
    }
    await tx.herbPurchase.deleteMany({ where: { billId: id } });
    await tx.supplierBill.delete({ where: { id } });
  });
}
