import { Octokit } from '@octokit/rest';
import { registerCollector } from '../registry.js';
import prisma from '../../lib/prismaClient.js';
import { buildGithubEnrichment } from '../enrichers/github.js';

const source = 'github';
const activityMode = process.env.GITHUB_ACTIVITY_MODE ?? 'authenticated_events';
const username = process.env.GITHUB_ACTIVITY_USERNAME;
// Maximum pages to fetch per run (100 events per page). Make configurable via env var
// to allow going farther back in history when needed.
const MAX_PAGES = Number(process.env.GITHUB_MAX_PAGES ?? 6);

const warnMissingConfig = (accountId) => {
  console.warn(`GitHub collector missing OAuth access token for connectedAccount=${accountId}`);
};

const mapEvent = async (event, octokitClient, userId) => {
  const payload = {
    type: event.type,
    repo: event.repo,
    actor: event.actor,
    public: event.public,
    raw: event.payload,
    url: event.url,
  };

  const enrichment = await buildGithubEnrichment(event, octokitClient);

  return {
    eventType: event.type,
    occurredAt: event.created_at,
    externalId: event.id,
    payload,
    userId,
    enrichment: enrichment ?? undefined,
  };
};
const collectForAccount = async (connectedAccount) => {
  const token = connectedAccount.oauthTokens?.[0]?.accessToken;
  if (!token) {
    warnMissingConfig(connectedAccount.id);
    return { items: [], nextCursor: null };
  }

  const octokit = new Octokit({ auth: token });
  const cursorRecord = await prisma.cursor.upsert({
    where: { source_connectedAccountId: { source, connectedAccountId: connectedAccount.id } },
    create: { source, connectedAccountId: connectedAccount.id },
    update: {},
  });

  let continuePaging = true;
  let page = 1;
  let newestId = null;
  let resolvedUsername = username;

  if (activityMode === 'authenticated_events' || !resolvedUsername) {
    const authUser = await octokit.rest.users.getAuthenticated();
    resolvedUsername = authUser.data.login;
  }

  const listPage = async (pageNumber) => {
    if (activityMode === 'authenticated_events') {
      if (!resolvedUsername) {
        throw new Error('Authenticated GitHub username could not be resolved');
      }
      return octokit.rest.activity.listEventsForAuthenticatedUser({ username: resolvedUsername, per_page: 100, page: pageNumber });
    }

    if (activityMode === 'user_events') {
      if (!username) {
        throw new Error('GITHUB_ACTIVITY_USERNAME is required when using user_events mode');
      }
      return octokit.rest.activity.listEventsForUser({ username, per_page: 100, page: pageNumber });
    }

    throw new Error(`Unsupported GitHub activity mode: ${activityMode}`);
  };

  const items = [];
  const sinceCursor = cursorRecord.cursor ?? null;

  while (continuePaging && page <= MAX_PAGES) {
    const response = await listPage(page);
    if (response.data.length === 0) {
      break;
    }

    if (!newestId) {
      newestId = response.data[0]?.id ?? null;
    }

    for (const event of response.data) {
      if (event.id === sinceCursor) {
        continuePaging = false;
        break;
      }

      items.push(await mapEvent(event, octokit, connectedAccount.userId));
    }

    if (!continuePaging || response.data.length < 100) {
      break;
    }

    page += 1;
  }

  if (newestId && newestId !== cursorRecord.cursor) {
    await prisma.cursor.update({
      where: { source_connectedAccountId: { source, connectedAccountId: connectedAccount.id } },
      data: { cursor: newestId },
    });
  }

  return { items, nextCursor: newestId ?? sinceCursor };
};

const collect = async () => {
  const accounts = await prisma.connectedAccount.findMany({
    where: { provider: 'github', status: 'active' },
    include: { oauthTokens: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });

  if (accounts.length === 0) {
    console.warn('No GitHub connected accounts found; skipping collection.');
    return { items: [], nextCursor: null };
  }

  const allItems = [];
  for (const account of accounts) {
    const { items = [] } = await collectForAccount(account);
    allItems.push(...items);
  }

  return { items: allItems, nextCursor: null };
};

registerCollector({ source, collect });

export default collect;
