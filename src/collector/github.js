import { Octokit } from '@octokit/rest';
import { registerCollector } from './runner.js';

const source = 'github';
const token = process.env.GITHUB_TOKEN;
const activityMode = process.env.GITHUB_ACTIVITY_MODE ?? 'authenticated_events';
const username = process.env.GITHUB_ACTIVITY_USERNAME;
const MAX_PAGES = 6;

const octokit = token ? new Octokit({ auth: token }) : null;

const warnMissingConfig = () => {
  console.warn('GitHub collector missing configuration (set GITHUB_TOKEN)');
};

const listPage = async (page) => {
  if (!octokit) {
    throw new Error('Octokit is not initialized');
  }

  if (activityMode === 'authenticated_events') {
    return octokit.rest.activity.listEventsForAuthenticatedUser({ per_page: 100, page });
  }

  if (activityMode === 'user_events') {
    if (!username) {
      throw new Error('GITHUB_ACTIVITY_USERNAME is required for user_events mode');
    }
    return octokit.rest.activity.listEventsForUser({ username, per_page: 100, page });
  }

  throw new Error(`Unsupported GitHub activity mode: ${activityMode}`);
};

const mapEvent = (event) => ({
  eventType: event.type,
  occurredAt: event.created_at,
  externalId: event.id,
  payload: {
    type: event.type,
    repo: event.repo,
    actor: event.actor,
    public: event.public,
    raw: event.payload,
    url: event.url,
  },
});

const collect = async (cursor) => {
  if (!octokit || !token) {
    warnMissingConfig();
    return { items: [], nextCursor: cursor };
  }

  const items = [];
  let continuePaging = true;
  let page = 1;
  let newestId = null;

  while (continuePaging && page <= MAX_PAGES) {
    const response = await listPage(page);
    if (response.data.length === 0) {
      break;
    }

    if (!newestId) {
      newestId = response.data[0]?.id ?? null;
    }

    for (const event of response.data) {
      if (event.id === cursor) {
        continuePaging = false;
        break;
      }

      items.push(mapEvent(event));
    }

    if (!continuePaging || response.data.length < 100) {
      break;
    }

    page += 1;
  }

  if (items.length === 0) {
    return { items: [], nextCursor: newestId ?? cursor };
  }

  return { items, nextCursor: newestId ?? cursor };
};

registerCollector({ source, collect });

export default collect;
