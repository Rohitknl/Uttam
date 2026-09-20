import prisma from '../config/database.js';
import { toNumber, toMoney, multiply } from '../utils/decimal.js';

function formatInvoiceLine(line) {
  return {
    id: line.id,
    herbCode: line.herbCode,
    herbName: line.herbName,
    quantity: toNumber(line.quantity),
    rate: toMoney(line.rate),
    amount: toMoney(line.amount),
    unit: line.unit || 'KG',
  };
}

function formatInvoice(bill) {
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
    subtotalAmount: toMoney(bill.subtotalAmount),
    taxType: bill.taxType,
    taxPercent: toNumber(bill.taxPercent, 2),
    taxAmount: toMoney(bill.taxAmount),
    totalAmount: toMoney(bill.totalAmount),
    notes: bill.notes,
    lines: (bill.lines || []).map(formatInvoiceLine),
  };
}

export async function queryInventory(supplierSearch, fromDate, toDate) {
  const where = {};
  if (supplierSearch) {
    where.supplierName = { contains: supplierSearch };
  }
  if (fromDate || toDate) {
    where.purchaseDate = {};
    if (fromDate) where.purchaseDate.gte = new Date(fromDate);
    if (toDate) where.purchaseDate.lte = new Date(toDate);
  }

  const purchases = await prisma.herbPurchase.findMany({
    where,
    include: { herb: { include: { herbCode: true } }, bill: true },
    orderBy: { purchaseDate: 'desc' },
  });

  const lines = purchases.map(p => ({
    id: p.id,
    herbId: p.herbId,
    herbName: p.herb.name,
    herbCode: p.herb.herbCode?.code || null,
    quantity: toNumber(p.quantity),
    rate: toMoney(p.rate),
    amount: toMoney(p.amount),
    supplierName: p.supplierName,
    purchaseDate: p.purchaseDate,
    billId: p.billId,
    billNumber: p.bill?.billNumber || null,
  }));

  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);

  const billIds = [...new Set(purchases.map(p => p.billId).filter(Boolean))];
  const bills = billIds.length
    ? await prisma.supplierBill.findMany({
      where: { id: { in: billIds } },
      include: { lines: true },
      orderBy: { billDate: 'desc' },
    })
    : [];

  const invoices = bills.map(formatInvoice);

  // Legacy purchases without a linked bill — still printable as simple invoices
  const orphanPurchases = purchases.filter(p => !p.billId);
  for (const p of orphanPurchases) {
    const amount = toMoney(p.amount);
    invoices.push({
      id: `purchase-${p.id}`,
      billNumber: `PUR-${p.id}`,
      supplierName: p.supplierName || '—',
      supplierContact: null,
      supplierEmail: null,
      supplierAddress: null,
      consigneeName: 'Uttam Laboratory',
      consigneeAddress: null,
      billDate: p.purchaseDate,
      subtotalAmount: amount,
      taxType: 'NONE',
      taxPercent: 0,
      taxAmount: 0,
      totalAmount: amount,
      notes: null,
      lines: [{
        id: p.id,
        herbCode: p.herb.herbCode?.code || null,
        herbName: p.herb.name,
        quantity: toNumber(p.quantity),
        rate: toMoney(p.rate),
        amount,
        unit: p.herb.unitOfMeasure || 'KG',
      }],
    });
  }

  return { lines, totalAmount: toMoney(totalAmount), invoices };
}

export async function getAdminAnalytics() {
  const herbs = await prisma.herb.findMany({ where: { active: true } });
  const medicines = await prisma.medicine.findMany({ where: { active: true } });
  const orders = await prisma.order.findMany();

  const lowStockHerbs = herbs
    .filter(h => toNumber(h.currentStock) <= toNumber(h.minimumStockAlert))
    .map(h => ({
      id: h.id,
      name: h.name,
      currentStock: toNumber(h.currentStock),
      minimumStockAlert: toNumber(h.minimumStockAlert),
      unitOfMeasure: h.unitOfMeasure,
    }));

  const lowStockMedicines = medicines
    .filter(m => toNumber(m.currentStock) <= toNumber(m.minimumStockAlert))
    .map(m => ({
      id: m.id,
      name: m.name,
      currentStock: toNumber(m.currentStock),
      minimumStockAlert: toNumber(m.minimumStockAlert),
    }));

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expiringMedicines = medicines
    .filter(m => m.expiryDate && new Date(m.expiryDate) <= thirtyDaysLater)
    .map(m => ({
      id: m.id,
      name: m.name,
      expiryDate: m.expiryDate,
      currentStock: toNumber(m.currentStock),
      expired: new Date(m.expiryDate) < now,
    }));

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: { in: ['APPROVED', 'DISPATCHED'] } } },
    include: { medicine: true },
  });

  const salesMap = {};
  for (const item of orderItems) {
    const name = item.medicine.name;
    if (!salesMap[name]) salesMap[name] = { name, totalQuantity: 0, totalRevenue: 0 };
    salesMap[name].totalQuantity += toNumber(item.quantity);
    salesMap[name].totalRevenue += toMoney(item.lineTotal);
  }
  const topSellingMedicines = Object.values(salesMap)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);

  const herbValue = herbs.reduce((sum, h) => {
    return sum + toMoney(multiply(h.currentStock, h.costPerUnit));
  }, 0);
  const medicineValue = medicines.reduce((sum, m) => {
    return sum + toMoney(multiply(m.currentStock, m.pricePerUnit));
  }, 0);

  const statusCounts = {};
  for (const order of orders) {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  }
  const orderStatusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  return {
    lowStockHerbs,
    lowStockMedicines,
    expiringHerbs: [],
    expiringMedicines,
    topSellingMedicines,
    stockValueDistribution: [
      { name: 'Herbs', value: toMoney(herbValue) },
      { name: 'Medicines', value: toMoney(medicineValue) },
    ],
    orderStatusBreakdown,
  };
}

export async function getDealerAnalytics(dealerId) {
  const orders = await prisma.order.findMany({ where: { dealerId } });

  const statusCounts = {};
  for (const order of orders) {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  }
  const orderStatusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  const approvedOrders = orders.filter(o => o.status === 'APPROVED' || o.status === 'DISPATCHED');
  const monthlyMap = {};
  for (const order of approvedOrders) {
    const month = order.createdAt.toISOString().slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { month, totalAmount: 0, orderCount: 0 };
    monthlyMap[month].totalAmount += toMoney(order.totalAmount);
    monthlyMap[month].orderCount += 1;
  }
  const monthlyPurchaseHistory = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  return { orderStatusBreakdown, monthlyPurchaseHistory };
}
