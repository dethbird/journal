import prisma from '../lib/prismaClient.js';

/**
 * Resolve Steam ID for a user from their connected accounts
 * Falls back to STEAM_ID env var for development/testing
 * @param {string|null} userId - User ID to look up
 * @returns {Promise<string|null>} - Steam ID (64-bit) or null
 */
export const resolveSteamId = async (userId = null) => {
  if (!userId) {
    // No user specified, try first user's Steam account
    const account = await prisma.connectedAccount.findFirst({
      where: { provider: 'steam', status: 'active' },
    });
    
    if (account?.providerAccountId) {
      return account.providerAccountId;
    }
    
    // Fall back to env var for development
    if (process.env.STEAM_ID) {
      console.warn('Using STEAM_ID env var fallback; best practice is to connect Steam account via OAuth.');
      return process.env.STEAM_ID;
    }
    
    return null;
  }
  
  // Look up specific user's Steam account
  const account = await prisma.connectedAccount.findFirst({
    where: {
      userId,
      provider: 'steam',
      status: 'active',
    },
  });
  
  if (account?.providerAccountId) {
    return account.providerAccountId;
  }
  
  // Fall back to env var for development
  if (process.env.STEAM_ID) {
    console.warn(`No Steam account found for user ${userId}; using STEAM_ID env var fallback.`);
    return process.env.STEAM_ID;
  }
  
  return null;
};

/**
 * Get all active Steam accounts (for collecting data across multiple users)
 * @returns {Promise<Array<{userId: string, steamId: string}>>}
 */
export const getAllSteamAccounts = async () => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { provider: 'steam', status: 'active' },
    select: {
      userId: true,
      providerAccountId: true,
    },
  });
  
  return accounts
    .filter(acc => acc.providerAccountId)
    .map(acc => ({
      userId: acc.userId,
      steamId: acc.providerAccountId,
    }));
};
