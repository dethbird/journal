import dotenv from 'dotenv';
import prisma from '../src/db/client.js';

dotenv.config();

async function main() {
  const email = 'rishi.satsangi@gmail.com';
  const displayName = 'dethbird';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists:', existing.id);
    return existing;
  }

  const user = await prisma.user.create({ data: { email, displayName } });
  console.log('Created user:', user.id);
  return user;
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
