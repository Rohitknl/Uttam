export function generateBatchNumber(prefix) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${date}-${random}`;
}

export function generateOrderNumber() {
  return generateBatchNumber('ORD');
}

export function generateProductionNumber() {
  return generateBatchNumber('PRD');
}
