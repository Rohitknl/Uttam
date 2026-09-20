import prisma from './src/config/database.js';

const users = await prisma.user.findMany({
  select: {
    id: true,
    username: true,
    fullName: true,
    role: true,
    active: true
  }
});

console.table(users);

await prisma.$disconnect();