import prisma from './src/config/database.js';
import { hashPassword } from './src/utils/bcrypt.js';

const username = 'admin';
const newPassword = 'Admin@123';

const hashed = await hashPassword(newPassword);

await prisma.user.update({
  where: { username },
  data: {
    password: hashed,
    mustChangePassword: false,
  },
});

console.log('Password reset successfully');
console.log('Username:', username);
console.log('New password:', newPassword);

await prisma.$disconnect();