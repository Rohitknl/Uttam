import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const targetDb = process.argv[2];
if (!targetDb) {
  console.error('Usage: node scripts/verify-empty-db.mjs <path-to-db>');
  process.exit(1);
}

const resolvedPath = path.resolve(targetDb);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: Database file not found at ${resolvedPath}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const require = createRequire(path.join(backend, 'package.json'));
const { PrismaClient } = require('@prisma/client');

const fileUrl = `file:${resolvedPath.replace(/\\/g, '/')}`;
const prisma = new PrismaClient({
  datasources: {
    db: { url: fileUrl },
  },
});

async function main() {
  const models = [
    { name: 'batch', label: 'Batches' },
    { name: 'herbCode', label: 'Herb Codes' },
    { name: 'herbPurchase', label: 'Herb Purchases' },
    { name: 'herb', label: 'Herbs' },
    { name: 'medicineCode', label: 'Medicine Codes' },
    { name: 'medicine', label: 'Medicines' },
    { name: 'orderItem', label: 'Order Items' },
    { name: 'order', label: 'Orders' },
    { name: 'productionBatch', label: 'Production Batches' },
    { name: 'recipeItem', label: 'Recipe Items' },
    { name: 'seller', label: 'Sellers' },
    { name: 'supplierBillLine', label: 'Supplier Bill Lines' },
    { name: 'supplierBill', label: 'Supplier Bills' },
  ];

  const errors = [];
  console.log(`Verifying database contents at: ${fileUrl}`);

  for (const { name, label } of models) {
    try {
      const count = await prisma[name].count();
      if (count > 0) {
        errors.append ? errors.append(`${label}: ${count} rows (must be 0)`) : errors.push(`${label}: ${count} rows (must be 0)`);
        console.error(`  [FAIL] ${label} (${name}): ${count} rows`);
      } else {
        console.log(`  [OK] ${label}: 0 rows (empty)`);
      }
    } catch (err) {
      console.warn(`  [WARN] ${label}: ${err.message}`);
    }
  }

  // Check users: allow only at most 1 user (the default admin)
  try {
    const userCount = await prisma.user.count();
    if (userCount > 1) {
      errors.push(`Users: ${userCount} users found (expected only default admin)`);
      console.error(`  [FAIL] Users: ${userCount} users`);
    } else {
      console.log(`  [OK] Users: ${userCount} user (default admin)`);
    }
  } catch (err) {
    console.warn(`  [WARN] Users: ${err.message}`);
  }

  if (errors.length > 0) {
    console.error('\n[FATAL ERROR] template.db contains pre-filled data! Build aborted:');
    for (const e of errors) {
      console.error('  - ' + e);
    }
    process.exit(1);
  }

  console.log('\n[SUCCESS] template.db is 100% verified clean with ZERO business data.');
}

main()
  .catch((err) => {
    console.error('Verification script crashed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
