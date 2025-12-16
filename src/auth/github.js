import prisma from '../lib/prismaClient.js';

const warnFallbackToEnv = () => {
  console.warn('Using GITHUB_TOKEN fallback; best practice is to store OAuth tokens + refresh tokens in the database.');
};

// OAuth collectors should request long-lived refresh tokens (e.g. `repo` scope plus `offline_access`).
// That way the refresh token can be stored alongside `accessToken` so the collector keeps running.
export const resolveGitHubAccessToken = async () => {
  const tokenRecord = await prisma.oAuthToken.findFirst({
    where: {
      connectedAccount: {
        provider: 'github',
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (tokenRecord?.accessToken) {
    return tokenRecord.accessToken;
  }

  if (process.env.GITHUB_TOKEN) {
    warnFallbackToEnv();
    return process.env.GITHUB_TOKEN;
  }

  return null;
};
