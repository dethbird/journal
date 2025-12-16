import { Octokit } from '@octokit/rest';
import { registerCollector } from './runner.js';
import { resolveGitHubAccessToken } from './githubAuth.js';

const source = 'github';
const activityMode = process.env.GITHUB_ACTIVITY_MODE ?? 'authenticated_events';
const username = process.env.GITHUB_ACTIVITY_USERNAME;
const MAX_PAGES = 6;

const warnMissingConfig = () => {
  console.warn('GitHub collector missing OAuth access token (lookups expect OAuthToken entries).');
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
  const token = await resolveGitHubAccessToken();
  if (!token) {
    warnMissingConfig();
    return { items: [], nextCursor: cursor };
  }

  const octokit = new Octokit({ auth: token });
  const items = [];
  let continuePaging = true;
  let page = 1;
  let newestId = null;

  const listPage = async (pageNumber) => {
    if (activityMode === 'authenticated_events') {
      return octokit.rest.activity.listEventsForAuthenticatedUser({ per_page: 100, page: pageNumber });
    }

    if (activityMode === 'user_events') {
      if (!username) {
        throw new Error('GITHUB_ACTIVITY_USERNAME is required when using user_events mode');
      }
      return octokit.rest.activity.listEventsForUser({ username, per_page: 100, page: pageNumber });
    }

    throw new Error(`Unsupported GitHub activity mode: ${activityMode}`);
  };

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

  return { items, nextCursor: newestId ?? cursor };
};

registerCollector({ source, collect });

export default collect;
