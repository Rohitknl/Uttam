import Decimal from 'decimal.js';

export function toDecimal(value) {
  if (value == null) return new Decimal(0);
  return new Decimal(value);
}

export function toNumber(value, decimals = 4) {
  if (value == null) return 0;
  return parseFloat(new Decimal(value).toFixed(decimals));
}

export function toMoney(value) {
  if (value == null) return 0;
  return parseFloat(new Decimal(value).toFixed(2));
}

export function formatDecimal(value) {
  return toDecimal(value).toFixed(4);
}

export function formatMoney(value) {
  return toDecimal(value).toFixed(2);
}

export function multiply(a, b) {
  return toDecimal(a).times(toDecimal(b));
}

export function add(a, b) {
  return toDecimal(a).plus(toDecimal(b));
}

export function subtract(a, b) {
  return toDecimal(a).minus(toDecimal(b));
}

export function divide(a, b) {
  const divisor = toDecimal(b);
  if (divisor.isZero()) return new Decimal(0);
  return toDecimal(a).dividedBy(divisor);
}

export function isLessOrEqual(a, b) {
  return toDecimal(a).lte(toDecimal(b));
}

export function isGreaterOrEqual(a, b) {
  return toDecimal(a).gte(toDecimal(b));
}

export function isNegative(a) {
  return toDecimal(a).isNegative();
}

export { Decimal };
