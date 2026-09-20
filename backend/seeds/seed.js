import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding clean admin user...');

  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      password,
      fullName: 'System Administrator',
      role: 'ROLE_ADMIN',
      email: 'admin@uttamlab.com',
      active: true,
    },
    create: {
      username: 'admin',
      password,
      fullName: 'System Administrator',
      role: 'ROLE_ADMIN',
      email: 'admin@uttamlab.com',
      active: true,
    },
  });

  console.log('Admin ready: admin / admin123');
  console.log('No sample inventory data seeded.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
