/**
 * One-time migration: store formulas on medicine codes instead of medicines.
 * Run: node scripts/migrate-formulas-to-medicine-codes.js
 * Then: npm run db:push && npm run db:generate
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(table, column) {
  const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function main() {
  if (!(await columnExists('recipe_items', 'medicine_id'))) {
    if (await columnExists('recipe_items', 'medicine_code_id')) {
      console.log('Already migrated.');
      return;
    }
    console.log('No recipe_items.medicine_id — nothing to migrate.');
    return;
  }

  console.log('Migrating formulas to medicine codes...');

  if (!(await columnExists('medicine_codes', 'formula_quantity'))) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE medicine_codes ADD COLUMN formula_quantity DECIMAL NOT NULL DEFAULT 1",
    );
  }
  if (!(await columnExists('medicine_codes', 'formula_unit'))) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE medicine_codes ADD COLUMN formula_unit TEXT NOT NULL DEFAULT 'PIECES'",
    );
  }

  if (await columnExists('medicines', 'formula_quantity')) {
    await prisma.$executeRawUnsafe(`
      UPDATE medicine_codes
      SET formula_quantity = (
        SELECT COALESCE(m.formula_quantity, 1)
        FROM medicines m
        WHERE m.medicine_code_id = medicine_codes.id
        LIMIT 1
      ),
      formula_unit = (
        SELECT COALESCE(m.formula_unit, 'PIECES')
        FROM medicines m
        WHERE m.medicine_code_id = medicine_codes.id
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM medicines m WHERE m.medicine_code_id = medicine_codes.id
      )
    `);
  }

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS recipe_items_new');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE recipe_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_code_id INTEGER NOT NULL,
      herb_id INTEGER NOT NULL,
      quantity DECIMAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'KG',
      FOREIGN KEY (medicine_code_id) REFERENCES medicine_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (herb_id) REFERENCES herbs(id),
      UNIQUE (medicine_code_id, herb_id)
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO recipe_items_new (id, medicine_code_id, herb_id, quantity, unit)
    SELECT ri.id, m.medicine_code_id, ri.herb_id, ri.quantity, ri.unit
    FROM recipe_items ri
    INNER JOIN medicines m ON m.id = ri.medicine_id
    WHERE m.medicine_code_id IS NOT NULL
  `);

  await prisma.$executeRawUnsafe('DROP TABLE recipe_items');
  await prisma.$executeRawUnsafe('ALTER TABLE recipe_items_new RENAME TO recipe_items');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS recipe_items_medicine_code_id_idx ON recipe_items(medicine_code_id)',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS recipe_items_herb_id_idx ON recipe_items(herb_id)',
  );

  console.log('Migration complete. Run: npm run db:push && npm run db:generate');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
