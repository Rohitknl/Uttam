import prisma from './src/config/database.js';
import { hashPassword } from './src/utils/bcrypt.js';

try {
  const username = 'rohit';
  const password = 'rohit@123';

  const existingUser = await prisma.user.findUnique({
    where: { username }
  });

  if (existingUser) {
    console.log('Admin user already exists.');
    console.log('Username:', existingUser.username);
    process.exit(0);
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      fullName: 'Administrator',
      role: 'ROLE_ADMIN',
      active: true,
      mustChangePassword: false
    }
  });

  console.log('');
  console.log('================================');
  console.log('ADMIN USER CREATED SUCCESSFULLY');
  console.log('================================');
  console.log('Username:', user.username);
  console.log('Password:', password);
  console.log('Role:', user.role);
  console.log('');
} catch (error) {
  console.error('');
  console.error('ERROR CREATING ADMIN USER:');
  console.error(error);
} finally {
  await prisma.$disconnect();
}