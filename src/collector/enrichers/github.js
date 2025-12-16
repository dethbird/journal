const extractBranch = (payload) => payload?.raw?.ref ?? payload?.branch ?? null;
const extractRepoName = (payload) => payload?.repo?.name ?? payload?.repoName ?? null;

const buildPush = (payload) => ({
  type: 'PushEvent',
  repo: extractRepoName(payload),
  branch: extractBranch(payload),
  before: payload?.raw?.before ?? null,
  head: payload?.raw?.head ?? payload?.head ?? null,
});

const buildPullRequest = (payload) => ({
  type: 'PullRequestEvent',
  repo: extractRepoName(payload),
  action: payload?.raw?.action ?? null,
  title: payload?.raw?.pull_request?.title ?? null,
  number: payload?.raw?.pull_request?.number ?? payload?.raw?.number ?? null,
  baseRef: payload?.raw?.pull_request?.base?.ref ?? null,
  headRef: payload?.raw?.pull_request?.head?.ref ?? null,
});

const buildFork = (payload) => ({
  type: 'ForkEvent',
  repo: extractRepoName(payload),
  forkedTo: payload?.raw?.forkee?.full_name ?? payload?.raw?.forkee?.name ?? null,
});

const buildWatch = (payload) => ({
  type: 'WatchEvent',
  repo: extractRepoName(payload),
  action: payload?.raw?.action ?? null,
});

const buildCreate = (payload) => ({
  type: 'CreateEvent',
  repo: extractRepoName(payload),
  ref: payload?.raw?.ref ?? null,
  refType: payload?.raw?.ref_type ?? null,
});

export const buildGithubEnrichment = (eventType, payload) => {
  switch (eventType) {
    case 'PushEvent':
      return buildPush(payload);
    case 'PullRequestEvent':
      return buildPullRequest(payload);
    case 'ForkEvent':
      return buildFork(payload);
    case 'WatchEvent':
      return buildWatch(payload);
    case 'CreateEvent':
      return buildCreate(payload);
    default:
      return null;
  }
};

export default buildGithubEnrichment;
