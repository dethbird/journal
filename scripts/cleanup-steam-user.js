import prisma from '../src/lib/prismaClient.js';

async function cleanupSteamUser() {
  console.log('Finding users with only Steam connections...');
  
  const users = await prisma.user.findMany({
    include: {
      connectedAccounts: true,
    },
  });
  
  for (const user of users) {
    const accounts = user.connectedAccounts || [];
    
    // Find users with only Steam connection
    if (accounts.length === 1 && accounts[0].provider === 'steam') {
      console.log(`\nFound Steam-only user:`);
      console.log(`  User ID: ${user.id}`);
      console.log(`  Email: ${user.email || '(none)'}`);
      console.log(`  Display Name: ${user.displayName}`);
      console.log(`  Steam ID: ${accounts[0].providerAccountId}`);
      console.log(`  Created: ${user.createdAt}`);
      
      // Delete the user and related data
      console.log(`\nDeleting user ${user.id}...`);
      
      // Delete all related records first
      await prisma.userEmailDelivery.deleteMany({ where: { userId: user.id } });
      await prisma.emailBookmarkSettings.deleteMany({ 
        where: { connectedAccount: { userId: user.id } } 
      });
      await prisma.googleTimelineSettings.deleteMany({ 
        where: { connectedAccount: { userId: user.id } } 
      });
      await prisma.trelloSettings.deleteMany({ where: { userId: user.id } });
      await prisma.oAuthToken.deleteMany({ 
        where: { connectedAccount: { userId: user.id } } 
      });
      await prisma.connectedAccount.deleteMany({ where: { userId: user.id } });
      await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
      await prisma.journalEntry.deleteMany({ where: { userId: user.id } });
      await prisma.journalLog.deleteMany({ where: { userId: user.id } });
      await prisma.goal.deleteMany({ where: { userId: user.id } });
      await prisma.collectorRun.deleteMany({ where: { userId: user.id } });
      await prisma.event.deleteMany({ where: { userId: user.id } });
      
      // Delete the user
      await prisma.user.delete({
        where: { id: user.id },
      });
      
      console.log(`✓ Deleted Steam-only user ${user.id}`);
    }
  }
  
  console.log('\nCleanup complete.');
}

cleanupSteamUser()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
