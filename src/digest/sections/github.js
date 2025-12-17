const MAX_REPOS_DISPLAY = Number(process.env.DIGEST_GH_MAX_REPOS ?? 6);
const MAX_COMMIT_LINES = Number(process.env.DIGEST_GH_MAX_COMMITS ?? 5);
const MAX_SUBJECTS = Number(process.env.DIGEST_GH_MAX_SUBJECTS ?? 4);

const getEnrichment = (event, type) => event.enrichments?.find((en) => en.enrichmentType === type)?.data ?? null;

const repoFallback = (event) => {
  const payload = event.payload ?? {};
  const raw = payload.raw ?? {};
  return (
    payload.repo?.name ??
    payload.repo?.full_name ??
    raw.repo?.full_name ??
    raw.repo?.name ??
    null
  );
};

const parseBranch = (rawRef, fallbackBranch) => {
  if (fallbackBranch) return fallbackBranch;
  if (typeof rawRef === 'string' && rawRef.startsWith('refs/heads/')) {
    return rawRef.slice('refs/heads/'.length);
  }
  return rawRef ?? null;
};

export const buildGithubSection = (events) => {
  if (!events?.length) return null;

  const pushes = events.filter((evt) => evt.eventType === 'PushEvent');
  const prs = events.filter((evt) => evt.eventType === 'PullRequestEvent');

  const groups = new Map();

  for (const evt of pushes) {
    const enrichment = getEnrichment(evt, 'github_push_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};

    const repo = enrichment?.repo ?? repoFallback(evt) ?? 'Unknown repo';
    const branch = enrichment?.branch ?? parseBranch(raw.ref, payload.branch);

    const commitCount = enrichment?.commit_count ?? raw.size ?? raw.commits?.length ?? 1;
    const subjects = Array.isArray(enrichment?.commit_subjects)
      ? enrichment.commit_subjects.filter(Boolean).slice(0, MAX_SUBJECTS)
      : [];
    const commitDetails = Array.isArray(enrichment?.commits)
      ? enrichment.commits
          .map((c) => ({ short: c.short_sha ?? (c.sha ? c.sha.slice(0, 7) : null), message: c.message ?? null }))
          .filter((c) => c.message)
      : [];

    const key = `${repo}::${branch ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, { repo, branch, commits: 0, subjects: [], commitDetails: new Map() });
    }

    const entry = groups.get(key);
    entry.commits += commitCount || 1;

    if (entry.subjects.length < MAX_SUBJECTS) {
      entry.subjects = [...entry.subjects, ...subjects].slice(0, MAX_SUBJECTS);
    }

    for (const detail of commitDetails) {
      const keySha = detail.short ?? detail.message;
      if (keySha && !entry.commitDetails.has(keySha)) {
        entry.commitDetails.set(keySha, detail);
      }
    }
  }

  const pushList = [];
  const stats = { commits: 0, repos: new Set() };

  if (groups.size > 0) {
    const sorted = [...groups.values()].sort((a, b) => b.commits - a.commits || a.repo.localeCompare(b.repo));
    const top = sorted.slice(0, MAX_REPOS_DISPLAY);
    for (const group of top) {
      stats.commits += group.commits;
      if (group.repo) {
        stats.repos.add(group.repo);
      }

      const commitDetails = [...group.commitDetails.values()].slice(0, MAX_COMMIT_LINES);
      const details = commitDetails.length
        ? commitDetails.map((detail) => ({ short: detail.short, message: detail.message }))
        : group.subjects.map((subject) => ({ short: null, message: subject }));

      pushList.push({
        repo: group.repo,
        branch: group.branch,
        commits: group.commits,
        details,
      });
    }
  }

  const prMap = new Map();
  for (const evt of prs) {
    const enrichment = getEnrichment(evt, 'github_pr_v1');
    const payload = evt.payload ?? {};
    const raw = payload.raw ?? {};
    const pr = raw.pull_request ?? {};

    const repo = enrichment?.repo ?? repoFallback(evt) ?? 'Unknown repo';
    const number = enrichment?.pr_number ?? pr.number ?? raw.number ?? null;
    const title = enrichment?.title ?? pr.title ?? null;

    const merged = pr.merged === true;
    const action = merged ? 'merged' : enrichment?.action ?? raw.action ?? 'updated';

    const label = title ? `PR "${title}"` : number ? `PR #${number}` : 'PR';
    const key = `${repo}#${number ?? evt.id}`;

    prMap.set(key, { repo, label, action });
  }

  const prList = [...prMap.values()];

  return {
    kind: 'github',
    summary: {
      commits: stats.commits,
      repoCount: stats.repos.size,
      prCount: prList.length,
    },
    pushes: pushList,
    prs: prList,
  };
};

export default buildGithubSection;
