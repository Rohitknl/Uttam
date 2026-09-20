import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning all application data...');

  // Delete in dependency order
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.productionBatch.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.supplierBillLine.deleteMany();
  await prisma.herbPurchase.deleteMany();
  await prisma.supplierBill.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.herb.deleteMany();
  await prisma.medicineCode.deleteMany();
  await prisma.herbCode.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.user.deleteMany();

  console.log('All tables cleared.');

  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      password,
      fullName: 'System Administrator',
      role: 'ROLE_ADMIN',
      email: 'admin@uttamlab.com',
      active: true,
    },
  });

  console.log('Clean admin user created: admin / admin123');
  console.log('Database is clean.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
